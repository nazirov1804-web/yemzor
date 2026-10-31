const databaseName = "yemzor-device-data";
const databaseVersion = 1;
const storeName = "companies";

let context = { user: null, company: null, subscription: null };
let writeQueue = Promise.resolve();

export const isInstalledApp = () =>
  typeof window !== "undefined" &&
  (new URLSearchParams(window.location.search).has("app") ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true);

export function updateDeviceContext(status) {
  if (!status || typeof status !== "object") return;
  context = {
    user: status.user || null,
    company: status.company || null,
    subscription: status.subscription || null,
  };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Qurilma bazasini ochib bo‘lmadi."));
  });
}

async function readCompany() {
  const { company, user } = context;
  if (!company?.id || !user?.id) {
    throw new Error("Avval internet orqali login qiling.");
  }
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database
        .transaction(storeName, "readonly")
        .objectStore(storeName)
        .get(company.id);
      request.onsuccess = () => {
        resolve(
          request.result || {
            id: company.id,
            company: {
              id: company.id,
              name: company.name || "Do‘kon",
              isDemo: Boolean(company.isDemo),
              demoExpiresAt: company.demoExpiresAt || null,
              absentDeduction: 0,
              restDayWorkBonusEnabled: false,
              restDayWorkBonusAmount: 0,
              abedPaymentsEnabled: true,
            },
            products: [],
            sales: [],
            receipts: [],
            notifications: [],
            movements: [],
            attendance: [],
            employees: user.role === "employee" ? [user] : [],
            managers: user.role === "manager" ? [user] : [],
            nextReceiptNumber: 0,
          },
        );
      };
      request.onerror = () => reject(request.error || new Error("Qurilma bazasini o‘qib bo‘lmadi."));
    });
  } finally {
    database.close();
  }
}

async function saveCompany(state) {
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const request = database
        .transaction(storeName, "readwrite")
        .objectStore(storeName)
        .put(state);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("Ma’lumotni qurilmaga yozib bo‘lmadi."));
    });
  } finally {
    database.close();
  }
}

function mutateCompany(update) {
  const operation = writeQueue.then(async () => {
    const state = await readCompany();
    const result = await update(state);
    await saveCompany(state);
    return result;
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

function id() {
  return window.crypto.randomUUID();
}

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function ensureSubscription() {
  if (context.subscription && !context.subscription.active) {
    const error = new Error("Joriy oy uchun obuna to‘lovi tasdiqlanishi kerak.");
    error.status = 423;
    error.details = { subscription: context.subscription };
    throw error;
  }
}

function requireRoles(...roles) {
  if (!roles.includes(context.user?.role)) fail("Bu amal uchun ruxsatingiz yo‘q.", 403);
}

async function verifyOwnerPassword(password) {
  let response;
  try {
    response = await fetch("/api/auth/verify", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: password }),
    });
  } catch {
    throw new Error("Parolni serverda tekshirib bo‘lmadi. Internet ulanishini tekshiring.");
  }
  if (response.ok) return;
  const result = await response.json().catch(() => null);
  fail(result?.error || "Joriy parol noto‘g‘ri.", response.status);
}

function unitQuantity(quantity, unit) {
  if (unit === "ton") return quantity * 1000;
  if (unit === "ml") return quantity / 1000;
  return quantity;
}

function baseUnit(unit) {
  if (unit === "weight") return "kg";
  if (unit === "liter") return "l";
  return unit;
}

function activeProduct(state, productId) {
  const product = state.products.find(
    (entry) => entry.id === productId && entry.active !== false,
  );
  if (!product) fail("Faol tovar topilmadi.", 404);
  return product;
}

function localStoreData(state) {
  const { user } = context;
  const ownerOrManager = ["company_owner", "manager"].includes(user.role);
  return {
    company: { ...state.company },
    products: state.products.filter((product) => product.active !== false),
    sales: [...state.sales].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    receipts: [...state.receipts],
    notifications: [...state.notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    movements: ownerOrManager
      ? [...state.movements]
      : state.movements.filter((item) => item.employeeId === user.id),
    attendance: ownerOrManager
      ? [...state.attendance]
      : state.attendance.filter((item) => item.employeeId === user.id),
    employees: ownerOrManager
      ? [...state.employees]
      : state.employees.filter((item) => item.id === user.id),
    managers: ownerOrManager ? [...state.managers] : [],
  };
}

function parsePath(path) {
  const url = new URL(path, window.location.origin);
  return { pathname: url.pathname, segments: url.pathname.split("/").filter(Boolean) };
}

export function handlesDeviceApi(path, method = "GET") {
  const { pathname, segments } = parsePath(path);
  if (pathname === "/api/store" && method === "GET") return true;
  if (pathname === "/api/company/settings" && method === "PATCH") return true;
  if (pathname === "/api/company/reset" && method === "POST") return true;
  if (pathname === "/api/products" && method === "POST") return true;
  if (segments[0] === "api" && segments[1] === "products" && segments.length === 3 && ["PATCH", "DELETE"].includes(method)) return true;
  if (segments[0] === "api" && segments[1] === "products" && segments[3] === "stock" && method === "POST") return true;
  if (pathname === "/api/sales" && method === "POST") return true;
  if (segments[0] === "api" && segments[1] === "receipts" && segments.length === 3 && method === "GET") return true;
  if (pathname === "/api/managers" && method === "GET") return true;
  if (segments[0] === "api" && segments[1] === "employees" && segments.length === 4 && ["attendance", "movements"].includes(segments[3]) && ["POST", "PUT"].includes(method)) return true;
  return false;
}

export async function saveAccountLocally(type, result) {
  const account = result?.[type === "managers" ? "manager" : "employee"];
  if (!account || !context.company?.id || !context.user?.id) return;
  await mutateCompany((state) => {
    const collection = type === "managers" ? state.managers : state.employees;
    const index = collection.findIndex((entry) => entry.id === account.id);
    if (index === -1) collection.push(account);
    else collection[index] = { ...collection[index], ...account };
  });
}

export async function removeAccountLocally(type, accountId) {
  if (!context.company?.id || !context.user?.id) return;
  await mutateCompany((state) => {
    const collection = type === "managers" ? state.managers : state.employees;
    const index = collection.findIndex((entry) => entry.id === accountId);
    if (index !== -1) collection.splice(index, 1);
    if (type === "employees") {
      state.movements = state.movements.filter((item) => item.employeeId !== accountId);
      state.attendance = state.attendance.filter((item) => item.employeeId !== accountId);
    }
  });
}

export async function mirrorAccountApi(path, method, result, body = {}) {
  const employeePath = path.match(/^\/api\/employees\/([^/]+)$/);
  const managerPath = path.match(/^\/api\/managers\/([^/]+)$/);
  if (method === "POST" && path === "/api/employees") {
    return saveAccountLocally("employees", {
      employee: { ...result.employee, monthlySalary: Number(body.monthlySalary), restDay: Number(body.restDay), startDate: body.startDate },
    });
  }
  if (method === "POST" && path === "/api/managers") {
    return saveAccountLocally("managers", {
      manager: { ...result.manager, monthlySalary: Number(body.monthlySalary || 0) },
    });
  }
  if (employeePath && method === "PATCH") {
    return saveAccountLocally("employees", {
      employee: { ...result.employee, monthlySalary: Number(body.monthlySalary), restDay: Number(body.restDay), startDate: body.startDate },
    });
  }
  if (managerPath && method === "PATCH") {
    return saveAccountLocally("managers", {
      manager: { ...result.manager, monthlySalary: Number(body.monthlySalary || 0) },
    });
  }
  if (employeePath && method === "DELETE") {
    return removeAccountLocally("employees", employeePath[1]);
  }
  if (managerPath && method === "DELETE") {
    return removeAccountLocally("managers", managerPath[1]);
  }
}

export async function deviceApi(path, options = {}) {
  ensureSubscription();
  const method = options.method || "GET";
  const body = options.body || {};
  const { pathname, segments } = parsePath(path);
  await writeQueue;

  if (pathname === "/api/store" && method === "GET") {
    requireRoles("company_owner", "manager", "employee");
    const state = await readCompany();
    await saveCompany(state);
    return localStoreData(state);
  }
  if (pathname === "/api/managers" && method === "GET") {
    requireRoles("company_owner", "manager");
    const state = await readCompany();
    return { managers: state.managers.filter((item) => item.active !== false) };
  }
  if (pathname === "/api/company/settings" && method === "PATCH") {
    requireRoles("company_owner");
    return mutateCompany((state) => {
      const amount = Number(body.absentDeduction);
      const bonus = Number(body.restDayWorkBonusAmount ?? state.company.restDayWorkBonusAmount);
      if (!Number.isFinite(amount) || amount < 0) fail("Kelmagan kun uchun chegirma 0 yoki musbat bo‘lishi kerak.");
      if (!Number.isSafeInteger(bonus) || bonus < 0) fail("Dam olish kunidagi bonus 0 yoki musbat butun so‘m bo‘lishi kerak.");
      Object.assign(state.company, {
        absentDeduction: Math.round(amount),
        restDayWorkBonusEnabled: body.restDayWorkBonusEnabled ?? state.company.restDayWorkBonusEnabled,
        restDayWorkBonusAmount: bonus,
        abedPaymentsEnabled: body.abedPaymentsEnabled ?? state.company.abedPaymentsEnabled,
      });
      return { company: { ...state.company } };
    });
  }
  if (pathname === "/api/company/reset" && method === "POST") {
    requireRoles("company_owner");
    if (body.confirmation !== "0 ga tushurish") fail("Tasdiqlash uchun “0 ga tushurish” iborasini aynan kiriting.");
    await verifyOwnerPassword(body.currentPassword);
    return mutateCompany((state) => {
      state.products = [];
      state.sales = [];
      state.receipts = [];
      state.notifications = [];
      state.movements = [];
      state.attendance = [];
      state.employees = [];
      state.managers = [];
      state.company.absentDeduction = 0;
      state.company.restDayWorkBonusEnabled = false;
      state.company.restDayWorkBonusAmount = 0;
      state.company.abedPaymentsEnabled = true;
      state.nextReceiptNumber = 0;
      return { cleared: {}, message: "Qurilmadagi do‘kon ma’lumotlari tozalandi." };
    });
  }
  if (pathname === "/api/products" && method === "POST") {
    requireRoles("company_owner", "manager");
    return mutateCompany((state) => {
      const name = String(body.name || "").trim();
      const unit = body.unit;
      const quantity = Number(body.quantity);
      const quantityUnit = body.quantityUnit || unit;
      const costPrice = Number(body.costPrice);
      const price = Number(body.price);
      const minimumPrice = Number(body.minimumPrice);
      const lowStockThreshold = Number(body.lowStockThreshold);
      const thresholdUnit = body.thresholdUnit || unit;
      if (name.length < 2 || name.length > 80) fail("Tovar nomi 2–80 ta belgi bo‘lishi kerak.");
      if (!["bag", "weight", "liter", "piece", "block"].includes(unit)) fail("Tovar birligini tekshiring.");
      if (!Number.isFinite(quantity) || quantity <= 0) fail("Tovar miqdori musbat bo‘lishi kerak.");
      if (![costPrice, price, minimumPrice].every((value) => Number.isSafeInteger(value) && value > 0)) fail("Tan narx va sotuv narxlarini musbat butun so‘mda kiriting.");
      if (minimumPrice > price) fail("Eng past narx asosiy narxdan katta bo‘lishi mumkin emas.");
      if (["bag", "piece", "block"].includes(unit) && (!Number.isSafeInteger(quantity) || quantityUnit !== unit)) fail("Qop, dona va blok miqdori butun son bo‘lishi kerak.");
      if (unit === "liter" && !["l", "ml"].includes(quantityUnit)) fail("Litr yoki millilitr birligini tanlang.");
      if (unit === "weight" && !["kg", "ton"].includes(quantityUnit)) fail("Vaznli tovar uchun kg yoki tonnani tanlang.");
      if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) fail("Qoldiq eslatmasi miqdorini tekshiring.");
      if (["bag", "piece", "block"].includes(unit) && (!Number.isSafeInteger(lowStockThreshold) || thresholdUnit !== unit)) fail("Qop, dona va blok eslatmasi butun birliklarda bo‘lishi kerak.");
      if (unit === "weight" && !["kg", "ton"].includes(thresholdUnit)) fail("Vaznli tovar eslatmasida kg yoki tonnani tanlang.");
      if (unit === "liter" && !["l", "ml"].includes(thresholdUnit)) fail("Suyuqlik eslatmasida litr yoki millilitrni tanlang.");
      if (state.products.some((item) => item.active !== false && item.name.toLocaleLowerCase("uz") === name.toLocaleLowerCase("uz"))) fail("Bunday nomdagi tovar allaqachon bor.", 409);
      const now = new Date().toISOString();
      const normalizedQuantity = unitQuantity(quantity, quantityUnit);
      const product = {
        id: id(), companyId: context.company.id, name, unit,
        volumeUnit: unit === "liter" ? quantityUnit : undefined,
        quantity: normalizedQuantity,
        lowStockThreshold: unitQuantity(lowStockThreshold, thresholdUnit),
        lowStockUnit: thresholdUnit,
        costPrice, price, minimumPrice, active: true, createdAt: now, updatedAt: now,
      };
      state.products.push(product);
      state.receipts.push({
        id: id(), companyId: context.company.id, productId: product.id, name,
        unit: baseUnit(unit), quantityUnit: unit === "liter" ? quantityUnit : unit,
        quantity: normalizedQuantity, price: costPrice,
        total: Math.round(normalizedQuantity * costPrice), costPrice,
        createdAt: now,
      });
      return { product };
    });
  }
  if (segments[0] === "api" && segments[1] === "products" && segments.length === 3 && method === "PATCH") {
    requireRoles("company_owner", "manager");
    return mutateCompany((state) => {
      const product = activeProduct(state, segments[2]);
      const nextName = String(body.name ?? product.name).trim();
      const nextCost = Number(body.costPrice ?? product.costPrice);
      const nextPrice = Number(body.price ?? product.price);
      const nextMinimum = Number(body.minimumPrice ?? product.minimumPrice);
      if (![nextCost, nextPrice, nextMinimum].every((value) => Number.isSafeInteger(value) && value > 0)) fail("Tan narx va sotuv narxlarini musbat butun so‘mda kiriting.");
      if (nextMinimum > nextPrice) fail("Eng past narx asosiy narxdan katta bo‘lishi mumkin emas.");
      if (state.products.some((item) => item.active !== false && item.id !== product.id && item.name.toLocaleLowerCase("uz") === nextName.toLocaleLowerCase("uz"))) fail("Bunday nomdagi tovar mavjud.", 409);
      Object.assign(product, { name: nextName, costPrice: nextCost, price: nextPrice, minimumPrice: nextMinimum, updatedAt: new Date().toISOString() });
      return { product };
    });
  }
  if (segments[0] === "api" && segments[1] === "products" && segments[3] === "stock" && method === "POST") {
    requireRoles("company_owner", "manager");
    return mutateCompany((state) => {
      const product = activeProduct(state, segments[2]);
      const quantity = Number(body.quantity);
      const unit = body.unit;
      const expected = product.unit === "weight" ? ["kg", "ton"] : product.unit === "liter" ? ["l", "ml"] : [product.unit];
      if (!Number.isFinite(quantity) || quantity <= 0 || !expected.includes(unit)) fail("Kirim miqdori va birligini tekshiring.");
      if (["bag", "piece", "block"].includes(unit) && !Number.isSafeInteger(quantity)) fail("Qop, dona va blok miqdori butun son bo‘lishi kerak.");
      const costPrice = Number(body.costPrice ?? product.costPrice);
      if (!Number.isSafeInteger(costPrice) || costPrice <= 0) fail("Kirimdagi tan narx musbat bo‘lishi kerak.");
      const normalizedQuantity = unitQuantity(quantity, unit);
      const previousQuantity = Number(product.quantity) || 0;
      const nextQuantity = previousQuantity + normalizedQuantity;
      product.costPrice = (previousQuantity * Number(product.costPrice) + normalizedQuantity * costPrice) / nextQuantity;
      product.quantity = nextQuantity;
      product.updatedAt = new Date().toISOString();
      state.receipts.push({
        id: id(), companyId: context.company.id, productId: product.id, name: product.name,
        unit: baseUnit(product.unit), quantityUnit: product.unit === "liter" ? unit : product.unit,
        quantity: normalizedQuantity, price: costPrice, total: Math.round(normalizedQuantity * costPrice),
        costPrice, createdAt: product.updatedAt,
      });
      return { product };
    });
  }
  if (segments[0] === "api" && segments[1] === "products" && segments.length === 3 && method === "DELETE") {
    requireRoles("company_owner", "manager");
    return mutateCompany((state) => {
      const product = activeProduct(state, segments[2]);
      product.active = false;
      product.archivedAt = new Date().toISOString();
      product.updatedAt = product.archivedAt;
      return { product: { id: product.id, name: product.name }, message: "Tovar faol ombordan olib tashlandi. Eski kirimlar va savdolar tarixda saqlandi." };
    });
  }
  if (pathname === "/api/sales" && method === "POST") {
    requireRoles("company_owner", "manager", "employee");
    return mutateCompany((state) => {
      if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) fail("Chekda 1–100 ta mahsulot bo‘lishi kerak.");
      const lines = body.items.map((item) => {
        const product = activeProduct(state, item.productId);
        const quantity = Number(item.quantity);
        const price = Number(item.price);
        if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isSafeInteger(price) || price <= 0) fail("Chekdagi tovar, miqdor yoki narx noto‘g‘ri.");
        if (["bag", "piece", "block"].includes(product.unit) && !Number.isSafeInteger(quantity)) fail(`${product.name}: miqdor butun son bo‘lishi kerak.`);
        if (price < product.minimumPrice || price > product.price) fail(`${product.name}: sotuv narxi ruxsat etilgan chegaradan tashqarida.`);
        const quantityUnit = product.unit === "liter" ? item.quantityUnit || product.volumeUnit || "l" : product.unit;
        const cost = Math.round(quantity * Number(product.costPrice || 0));
        const lineTotal = Math.round(quantity * price);
        return {
          productId: product.id, name: product.name, unit: product.unit, quantityUnit,
          quantity, price, costPrice: Number(product.costPrice || 0), cost,
          profit: lineTotal - cost, lineTotal,
        };
      });
      const totalsByProduct = new Map();
      for (const line of lines) totalsByProduct.set(line.productId, (totalsByProduct.get(line.productId) || 0) + line.quantity);
      for (const [productId, quantity] of totalsByProduct) {
        const product = activeProduct(state, productId);
        if (quantity > product.quantity) fail(`${product.name}: omborda so‘ralgan miqdor yetarli emas.`, 409);
      }
      const createdAt = new Date().toISOString();
      const notifications = [];
      for (const [productId, quantity] of totalsByProduct) {
        const product = activeProduct(state, productId);
        const previousQuantity = product.quantity;
        product.quantity = Math.max(0, product.quantity - quantity);
        product.updatedAt = createdAt;
        const alertUnit = product.lowStockUnit || baseUnit(product.unit);
        const remaining = alertUnit === "ton"
          ? product.quantity / 1000
          : alertUnit === "ml"
            ? product.quantity * 1000
            : product.quantity;
        const unitLabels = { bag: "qop", kg: "kg", ton: "tonna", l: "litr", ml: "ml", piece: "dona", block: "blok" };
        const notify = (kind, title, message) => {
          const item = { id: id(), companyId: context.company.id, kind, title, message, date: createdAt.slice(0, 10), createdAt };
          state.notifications.push(item);
          notifications.push(item);
        };
        if (product.lowStockThreshold > 0 && previousQuantity > product.lowStockThreshold && product.quantity <= product.lowStockThreshold) {
          notify("stock", "Tovar qoldig‘i kamaydi", `${product.name}: ${remaining.toLocaleString("uz-UZ")} ${unitLabels[alertUnit] || alertUnit} qoldi.`);
        }
        if (previousQuantity > 0 && product.quantity === 0) {
          notify("stockout", "Tovar tugadi", `${product.name}: omborda mahsulot qolmadi.`);
        }
      }
      const selectedSeller = body.sellerId
        ? state.employees.find((entry) => entry.id === body.sellerId && entry.active !== false)
        : null;
      if (body.sellerId && !selectedSeller) fail("Tanlangan sotuvchi ushbu do‘konda faol emas.");
      const seller = selectedSeller || context.user;
      const sale = {
        id: id(), companyId: context.company.id,
        receiptNumber: String(++state.nextReceiptNumber).padStart(6, "0"),
        sellerId: seller.id, sellerName: seller.name || "Hodim",
        companyName: state.company.name, items: lines,
        total: lines.reduce((total, line) => total + line.lineTotal, 0),
        purchaseTotal: lines.reduce((total, line) => total + line.cost, 0),
        profit: lines.reduce((total, line) => total + line.profit, 0),
        createdAt,
      };
      state.sales.push(sale);
      state.sales.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { sale, notifications };
    });
  }
  if (segments[0] === "api" && segments[1] === "receipts" && segments.length === 3 && method === "GET") {
    const number = segments[2].replace(/\D/g, "").padStart(6, "0");
    const state = await readCompany();
    const sale = state.sales.find((item) => item.receiptNumber === number);
    if (!sale) fail("Bu raqamli chek ushbu do‘konda topilmadi.", 404);
    return { sale };
  }
  if (segments[0] === "api" && segments[1] === "employees" && segments.length === 4 && segments[3] === "attendance" && method === "PUT") {
    requireRoles("company_owner", "manager");
    return mutateCompany((state) => {
      const employee = state.employees.find((item) => item.id === segments[2] && item.active !== false);
      if (!employee) fail("Faol hodim topilmadi.", 404);
      const date = String(body.date || "");
      const attendanceStatus = body.status;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > new Date().toISOString().slice(0, 10)) fail("Davomat sanasini tekshiring.");
      if (!["present", "absent", "excused"].includes(attendanceStatus)) fail("Davomat holatini tekshiring.");
      if (attendanceStatus === "excused" && String(body.reason || "").trim().length < 3) fail("Sababli kelmaganlik uchun sababni kiriting.");
      if (attendanceStatus === "excused" && String(body.reason || "").trim().length > 300) fail("Sabab 300 ta belgidan oshmasligi kerak.");
      const startDate = employee.startDate || employee.createdAt?.slice(0, 10);
      if (startDate && date < startDate) fail("Ish boshlash sanasidan oldingi davomatni belgilab bo‘lmaydi.");
      if (
        attendanceStatus !== "present" &&
        Number.isInteger(employee.restDay) &&
        new Date(`${date}T00:00:00.000Z`).getUTCDay() === employee.restDay
      ) {
        fail("Bu xodimning haftalik dam olish kuni; davomat va jarima qayd etilmaydi.");
      }
      const existing = state.attendance.find((item) => item.employeeId === employee.id && item.date === date);
      const record = existing || { id: id(), companyId: context.company.id, employeeId: employee.id, createdAt: new Date().toISOString() };
      Object.assign(record, {
        employeeName: employee.name, date, status: attendanceStatus,
        reason: attendanceStatus === "excused" ? String(body.reason || "").trim() : "",
        restDay: Number.isInteger(employee.restDay) ? employee.restDay : null,
        updatedAt: new Date().toISOString(), updatedBy: context.user.id,
      });
      if (!existing) state.attendance.push(record);
      return { attendance: record };
    });
  }
  if (segments[0] === "api" && segments[1] === "employees" && segments.length === 4 && segments[3] === "movements" && method === "POST") {
    requireRoles("company_owner", "manager");
    return mutateCompany((state) => {
      const employee = state.employees.find((item) => item.id === segments[2]);
      if (!employee) fail("Hodim topilmadi.", 404);
      if (!["advance", "abed"].includes(body.kind)) fail("To‘lov turi avans yoki Abed bo‘lishi kerak.");
      const amount = Number(body.amount);
      const period = String(body.period || "");
      const date = String(body.date || new Date().toISOString().slice(0, 10));
      if (!Number.isSafeInteger(amount) || amount <= 0 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) fail("To‘lov summasi yoki hisob oyini tekshiring.");
      if (body.kind === "abed" && state.company.abedPaymentsEnabled === false) fail("Tushlik/Abed to‘lovlari hozir o‘chirilgan.", 403);
      if (body.kind === "abed" && date.slice(0, 7) !== period) fail("Abed puli oyi uning sanasiga mos bo‘lishi kerak.");
      const movement = {
        id: id(), companyId: context.company.id, employeeId: employee.id,
        employeeName: employee.name, kind: body.kind, amount, period, date,
        createdAt: new Date().toISOString(), createdBy: context.user.id,
      };
      state.movements.push(movement);
      return { movement };
    });
  }
  fail("Bu amal qurilma bazasida qo‘llab-quvvatlanmaydi.", 501);
}
