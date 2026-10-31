import { useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState, memo } from "react";
import { createPortal } from "react-dom";
import {
  FiActivity,
  FiArrowDownLeft,
  FiArrowUpRight,
  FiBell,
  FiBox,
  FiBriefcase,
  FiCalendar,
  FiCheck,
  FiChevronRight,
  FiClock,
  FiDollarSign,
  FiDownload,
  FiLogOut,
  FiMonitor,
  FiPlus,
  FiPrinter,
  FiEye,
  FiEyeOff,
  FiMessageCircle,
  FiPhone,
  FiSmartphone,
  FiSearch,
  FiShield,
  FiShoppingCart,
  FiTrash2,
  FiMenu,
  FiTrendingUp,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { Toaster, toast as sonnerToast } from "sonner";
import QRCode from "qrcode";
import { api, money, numberInput, readNumber } from "./api";
import { translateText } from "./i18n";
import salesReceiptImage from "./img/savdo.png";
import employeeTeamImage from "./img/hodimlar.png";
import feedGrainImage from "./assets/feed-grain.jpg";
import farmCattleImage from "./assets/farm-cattle.jpg";
import feedBranImage from "./assets/feed-bran.jpg";
import ThemeToggle from "./components/ThemeToggle";
import OfferPage from "./pages/OfferPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";

const monthKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const dayKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const weekdays = [
  { value: 1, label: "Dushanba" },
  { value: 2, label: "Seshanba" },
  { value: 3, label: "Chorshanba" },
  { value: 4, label: "Payshanba" },
  { value: 5, label: "Juma" },
  { value: 6, label: "Shanba" },
  { value: 0, label: "Yakshanba" },
];
const landingSectionNavigation = [
  ["#imkoniyatlar", "Imkoniyatlar"],
  ["#rollar", "Rollar"],
  ["#jarayon", "Ish jarayoni"],
  ["#mahsulotlar", "Mahsulotlar"],
  ["#birliklar", "Birliklar"],
  ["#boglanish", "Bog‘lanish"],
];
const dateWeekday = (date) => new Date(`${date}T00:00:00.000Z`).getUTCDay();
const isRestDay = (employee, date) =>
  Number.isInteger(employee?.restDay) && dateWeekday(date) === employee.restDay;
const weekdayName = (value) =>
  weekdays.find((day) => day.value === value)?.label || "Belgilanmagan";
const startOfWeek = (date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
};
const amountSum = (rows) =>
  rows.reduce((total, row) => total + (Number(row.total) || 0), 0);
const unitName = (unit) =>
  ({ bag: "qop", weight: "kg", kg: "kg", ton: "tonna", liter: "litr", l: "litr", ml: "ml", piece: "dona", pcs: "dona", block: "blok" })[unit] || unit;
const quantityDigits = (unit) => (["weight", "kg", "ton", "liter", "l"].includes(unit) ? 3 : 0);
const volumeFactor = (unit) => (unit === "ml" ? 0.001 : 1);
const formatQuantity = (quantity, unit) =>
  Number(quantity).toLocaleString(currentLocale(), { maximumFractionDigits: quantityDigits(unit) });
const movementQuantity = (rows) => {
  const grouped = new Map();
  for (const row of rows) grouped.set(row.unit, (grouped.get(row.unit) || 0) + Number(row.quantity));
  return grouped.size
    ? [...grouped].map(([unit, quantity]) => `${formatQuantity(quantity, unit)} ${unitName(unit)}`).join(" · ")
    : `0`;
};
const quantityLabel = (product, quantity = product.quantity) =>
  `${formatQuantity(quantity, product.unit)} ${unitName(product.unit)}`;
const saleQuantityLabel = (product, quantity = product.quantity) =>
  product.unit === "liter" &&
  (product.volumeInputUnit || product.quantityUnit) === "ml"
    ? `${(Number(quantity) * 1000).toLocaleString(currentLocale(), { maximumFractionDigits: 3 })} ${unitName("ml")}`
    : `${Number(quantity).toLocaleString(currentLocale(), { maximumFractionDigits: product.unit === "weight" ? 6 : quantityDigits(product.unit) })} ${unitName(product.unit)}`;
const currentLocale = () => {
  const language = document.documentElement.lang;
  return language === "ru" ? "ru-RU" : language === "en" ? "en-US" : "uz-UZ";
};
const currentLanguage = () => {
  const language = document.documentElement.lang;
  return language === "ru" || language === "en" ? language : "uz";
};
const employeeCountLabel = (count) => {
  const language = currentLanguage();
  if (language === "en")
    return `${count} ${count === 1 ? "employee" : "employees"}`;
  if (language === "ru") {
    const remainder100 = count % 100;
    const remainder10 = count % 10;
    const noun =
      remainder100 >= 11 && remainder100 <= 14
        ? "сотрудников"
        : remainder10 === 1
          ? "сотрудник"
          : remainder10 >= 2 && remainder10 <= 4
            ? "сотрудника"
            : "сотрудников";
    return `${count} ${noun}`;
  }
  return `${count} hodim`;
};
const translateToastMessage = (message) =>
  translateText(String(message), currentLanguage());
const toast = {
  success: (message, ...options) =>
    sonnerToast.success(translateToastMessage(message), ...options),
  error: (message, ...options) =>
    sonnerToast.error(translateToastMessage(message), ...options),
};
const localizedMonth = (value) =>
  new Intl.DateTimeFormat(currentLocale(), {
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}-01T00:00:00`));
const dateTime = (value) =>
  new Intl.DateTimeFormat(currentLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const receiptDateTime = (value) =>
  new Intl.DateTimeFormat(currentLocale(), {
    dateStyle: "short",
    timeStyle: "medium",
    hour12: false,
  }).format(new Date(value));
const productUpdates = [
  {
    id: "release-2026-10-store-tools",
    title: "Yemzor boshqaruviga yangi imkoniyatlar",
    message:
      "Dam olish kuni bonusi va tushlik to‘lovlari sozlanadi, mahsulot tarixini saqlagan holda arxivlanadi, har bir oy hisoboti alohida ko‘riladi va hisobni tozalash do‘konning operatsion ma’lumotlarini yangidan boshlashga imkon beradi.",
    date: "2026-10-29",
  },
  {
    id: "release-2026-10-inventory-alerts",
    title: "Ombor eslatmalari va litr/ml hisobi",
    message:
      "Tovar uchun qoldiq eslatmasi belgilang: qoldiq chegaraga yetganda va tugaganda bildirishnoma hamda toaster xabari chiqadi. Suyuqliklarni litr yoki millilitrda kirim va savdo qiling.",
    date: "2026-10-29",
  },
  {
    id: "release-2026-10-attendance-months",
    title: "Davomat va oylik tarix yangilandi",
    message:
      "Davomat tugmalari bosilganda o‘lchami o‘zgarmaydi. Oylar tarixda saqlanadi va yangi oy boshlanganda tanlovga avtomatik qo‘shiladi.",
    date: "2026-10-29",
  },
  {
    id: "release-2026-10-theme",
    title: "Tun va kun rejimi",
    message:
      "Endi ko‘rinishni sozlamalardan istalgan payt almashtirib, tanlovingizni saqlab qo‘yishingiz mumkin.",
    date: "2026-10-05",
  },
  {
    id: "release-2026-10-landing",
    title: "Yemzor landing sahifasi yangilandi",
    message:
      "Do‘kon ish jarayoni, xodim rollari, tez-tez so‘raladigan savollar va huquqiy sahifalar aniqroq ko‘rinishda.",
    date: "2026-10-05",
  },
];

function getBillingReminder(company, subscription, now, supportContacts) {
  if (!company?.createdAt || !subscription?.amountConfigured) return null;
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type) => dateParts.find((item) => item.type === type)?.value;
  const year = Number(part("year"));
  const month = Number(part("month"));
  const today = Number(part("day"));
  const createdDay = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tashkent",
      day: "2-digit",
    }).format(new Date(company.createdAt)),
  );
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dueDay = Math.min(createdDay, lastDay);
  const daysLeft = dueDay - today;
  if (daysLeft > 5 || (subscription.active && daysLeft <= 0)) return null;
  const dueDate = `${year}-${String(month).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;
  const helpContacts = [
    supportContacts?.phone,
    supportContacts?.telegram
      ? `@${supportContacts.telegram.replace(/^@/, "")}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    id: `billing-${subscription.period}-${dueDate}-${dayKey(now)}`,
    title:
      daysLeft < 0
        ? "Yemzor oylik obunangiz tugadi"
        : daysLeft === 0
          ? "Yemzor oylik obunangiz bugun tugaydi"
          : `Yemzor oylik obunangiz tugashiga ${daysLeft} kun qoldi`,
    message:
      daysLeft < 0
        ? `Obuna muddati tugagan. Davom ettirish uchun ${money(subscription.requiredAmount)} to‘lovni amalga oshiring.${helpContacts ? ` Yordam: ${helpContacts}.` : ""}`
        : `${dueDate} sanasigacha ${money(subscription.requiredAmount)} oylik to‘lovni amalga oshiring.`,
    date: dayKey(now),
    kind: "billing",
  };
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function App() {
  const [, refreshLanguage] = useState(0);
  const [theme, setTheme] = useState(
    () => window.localStorage.getItem("yemzor:theme") || "light",
  );
  const [isInstalledApp] = useState(
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true ||
      new URLSearchParams(window.location.search).has("app"),
  );
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState("");
  const [data, setData] = useState(null);
  const [pageSelection, setPageSelection] = useState(null);
  const [accessView, setAccessView] = useState(() =>
    isInstalledApp ? "login" : "landing",
  );
  const [legalPage, setLegalPage] = useState("");
  const [modal, setModal] = useState("");
  const [selected, setSelected] = useState(null);
  const [publicSettings, setPublicSettings] = useState({
    phone: "",
    telegram: "naziroff1",
  });
  const user = status?.user;
  useEffect(() => {
    const handleLanguageChange = () =>
      refreshLanguage((current) => current + 1);
    window.addEventListener("yemzor:language-change", handleLanguageChange);
    return () =>
      window.removeEventListener(
        "yemzor:language-change",
        handleLanguageChange,
      );
  }, []);
  useEffect(() => {
    const preventCopy = (event) => event.preventDefault();
    const preventTextSelection = (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest("input, textarea, [contenteditable='true']")
      ) {
        return;
      }
      event.preventDefault();
    };
    document.addEventListener("copy", preventCopy);
    document.addEventListener("cut", preventCopy);
    document.addEventListener("contextmenu", preventCopy);
    document.addEventListener("dragstart", preventCopy);
    document.addEventListener("selectstart", preventTextSelection);
    return () => {
      document.removeEventListener("copy", preventCopy);
      document.removeEventListener("cut", preventCopy);
      document.removeEventListener("contextmenu", preventCopy);
      document.removeEventListener("dragstart", preventCopy);
      document.removeEventListener("selectstart", preventTextSelection);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("yemzor:theme", theme);
  }, [theme]);
  const toggleTheme = () =>
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  const emptyStoreData = useCallback(
    (company) => ({
      company: company
        ? {
            id: company.id,
            name: company.name,
            isDemo: Boolean(company.isDemo),
            demoExpiresAt: company.demoExpiresAt || null,
            absentDeduction: 0,
          }
        : { name: "Do‘kon" },
      products: [],
      sales: [],
      receipts: [],
      movements: [],
      attendance: [],
      employees: [],
    }),
    [],
  );
  const savedPage = user
    ? window.localStorage.getItem(`yemzor:last-page:${user.id}`)
    : null;
  const activePage =
    pageSelection && pageSelection.userId === user?.id
      ? pageSelection.page
      : savedPage || "overview";
  const setActivePage = useCallback(
    (page) => {
      if (!user?.id) return;
      window.localStorage.setItem(`yemzor:last-page:${user.id}`, page);
      setPageSelection({ userId: user.id, page });
    },
    [user],
  );

  const refreshStatus = useCallback(async () => {
    const [result, contact] = await Promise.all([
      api("/api/status"),
      api("/api/public/settings"),
    ]);
    setPublicSettings(contact);
    let storeData = null;
    if (
      result.subscription?.active &&
      result.user &&
      ["company_owner", "manager", "employee"].includes(result.user.role)
    ) {
      try {
        storeData = await api("/api/store");
      } catch (error) {
        toast.error(error.message);
        storeData = emptyStoreData(result.company);
      }
    }
    setStatus(result);
    setData(storeData);
    setBootError("");
    setLoading(false);
    return result;
  }, [emptyStoreData]);

  useEffect(() => {
    let active = true;
    Promise.all([api("/api/status"), api("/api/public/settings")])
      .then(async ([result, contact]) => {
        let storeData = null;
        if (
          result.subscription?.active &&
          result.user &&
          ["company_owner", "manager", "employee"].includes(result.user.role)
        ) {
          try {
            storeData = await api("/api/store");
          } catch (error) {
            toast.error(error.message);
            storeData = emptyStoreData(result.company);
          }
        }
        if (!active) return;
        setPublicSettings(contact);
        setStatus(result);
        setData(storeData);
        setLoading(false);
      })
      .catch((error) => {
        if (!active) return;
        setBootError(error.message);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [emptyStoreData]);

  const refreshStore = useCallback(async () => {
    let storeData;
    try {
      storeData = await api("/api/store");
    } catch (error) {
      if (error.status === 423) {
        setData(null);
        setStatus((current) =>
          current
            ? {
                ...current,
                subscription: error.details?.subscription || {
                  ...current.subscription,
                  active: false,
                },
              }
            : current,
        );
        return null;
      }
      if (error.status === 401) {
        setData(null);
        setStatus((current) =>
          current ? { ...current, user: null } : current,
        );
      }
      throw error;
    }
    setData(storeData);
    setStatus((current) => {
      if (!current?.user) return current;
      const ownAccount = storeData.employees.find(
        (employee) => employee.id === current.user.id,
      );
      if (
        !ownAccount ||
        (ownAccount.name === current.user.name &&
          ownAccount.monthlySalary === current.user.monthlySalary)
      )
        return current;
      return { ...current, user: { ...current.user, ...ownAccount } };
    });
  }, []);

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
      setStatus((current) => ({ ...current, user: null }));
      setData(null);
      setAccessView(isInstalledApp ? "login" : "landing");
    } catch (error) {
      toast.error(error.message);
    }
  }

  const content =
    loading || !status ? (
      <div className="boot-screen">
        <img className="brand-symbol" src="/yemzor-logo.png" alt="" />
        <strong>Yemzor</strong>
        <span>{bootError || "Tizim yuklanmoqda..."}</span>
        {bootError && (
          <button
            className="button button-secondary"
            onClick={() => {
              setLoading(true);
              refreshStatus().catch((error) => {
                setBootError(error.message);
                setLoading(false);
              });
            }}
          >
            Qayta urinish
          </button>
        )}
      </div>
    ) : !user ? (
      accessView === "landing" ? (
        <>
          <LandingPage
            phone={publicSettings.phone}
            telegram={publicSettings.telegram}
            onLogin={() => setAccessView("login")}
            onDemo={() => setAccessView("demo")}
            onLegal={(page) => setLegalPage(page)}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
          {legalPage && (
            <div className="legal-overlay">
              {legalPage === "offer" ? (
                <OfferPage
                  onBack={() => setLegalPage("")}
                  theme={theme}
                  onToggleTheme={toggleTheme}
                />
              ) : (
                <PrivacyPolicyPage
                  onBack={() => setLegalPage("")}
                  theme={theme}
                  onToggleTheme={toggleTheme}
                />
              )}
            </div>
          )}
        </>
      ) : accessView === "login" ? (
        <AccessPage
          setupRequired={status.setupRequired}
          onSuccess={refreshStatus}
          onBack={() => setAccessView(isInstalledApp ? "login" : "landing")}
          showBack={!isInstalledApp}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      ) : accessView === "demo" ? (
        <DemoRegistrationPage
          onSuccess={refreshStatus}
          onBack={() => setAccessView(isInstalledApp ? "login" : "landing")}
          onExistingDemo={() => setAccessView("login")}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      ) : null
    ) : user.role === "platform_admin" ? (
      <PlatformPage
        user={user}
        onLogout={logout}
        onContactSave={setPublicSettings}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    ) : status.subscription?.demo && !status.subscription.active ? (
      <DemoExpiredGate
        onLogout={logout}
        onRestart={async () => {
          await logout();
          setAccessView("demo");
        }}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    ) : !status.subscription?.active ? (
      <SubscriptionGate
        company={status.company}
        subscription={status.subscription}
        supportContacts={publicSettings}
        theme={theme}
        onToggleTheme={toggleTheme}
        onRefresh={() =>
          refreshStatus().catch((error) => toast.error(error.message))
        }
        onLogout={logout}
      />
    ) : data ? (
      <StoreApp
        user={user}
        data={data}
        subscription={status.subscription}
        supportContacts={publicSettings}
        theme={theme}
        onToggleTheme={toggleTheme}
        activePage={activePage}
        setActivePage={setActivePage}
        onRefresh={refreshStore}
        onLogout={logout}
        modal={modal}
        setModal={setModal}
        selected={selected}
        setSelected={setSelected}
        onUserUpdate={(updatedUser) =>
          setStatus((current) => ({ ...current, user: updatedUser }))
        }
      />
    ) : (
      <main className="boot-screen">
        <img className="brand-symbol" src="/yemzor-logo.png" alt="" />
        <strong>Yemzor</strong>
        <span>Do‘kon ma’lumotlari yuklanmadi. Qayta urining.</span>
        <button
          className="button button-secondary"
          onClick={() => {
            setLoading(true);
            refreshStatus().catch((error) => {
              setBootError(error.message);
              setLoading(false);
            });
          }}
        >
          Qayta yuklash
        </button>
      </main>
    );
  return (
    <>
      {content}
      <Toaster position="top-center" richColors closeButton theme={theme} />
    </>
  );
}

function LandingPage({
  phone,
  telegram,
  onLogin,
  onDemo,
  onLegal,
  theme,
  onToggleTheme,
}) {
  const now = useClock();
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [mobileDrawerMounted, setMobileDrawerMounted] = useState(false);
  const [activeSection, setActiveSection] = useState("");
  const heroBannerRef = useRef(null);
  useEffect(() => {
    let frame = 0;
    let pointerX = window.innerWidth / 2;
    let pointerY = window.innerHeight / 2;
    function trackPagePointer(event) {
      if (event.pointerType === "touch") return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        const banner = heroBannerRef.current;
        if (banner) {
          const offsetX = (pointerX / window.innerWidth - 0.5) * 110;
          const offsetY = (pointerY / window.innerHeight - 0.5) * 110;
          banner.style.setProperty("--grid-x", `${offsetX.toFixed(1)}px`);
          banner.style.setProperty("--grid-y", `${offsetY.toFixed(1)}px`);
        }
        frame = 0;
      });
    }
    window.addEventListener("pointermove", trackPagePointer, { passive: true });
    return () => {
      window.removeEventListener("pointermove", trackPagePointer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    const sections = landingSectionNavigation
      .map(([href]) => document.querySelector(href))
      .filter(Boolean);
    let frame = 0;
    const updateActiveSection = () => {
      frame = 0;
      const marker = window.innerHeight * 0.34;
      if (sections[0]?.getBoundingClientRect().top > marker) {
        setActiveSection("");
        return;
      }
      const active = sections.reduce(
        (closest, section) => {
          const bounds = section.getBoundingClientRect();
          const distance =
            marker < bounds.top
              ? bounds.top - marker
              : marker > bounds.bottom
                ? marker - bounds.bottom
                : 0;
          return distance < closest.distance
            ? { id: section.id, distance }
            : closest;
        },
        { id: "", distance: Number.POSITIVE_INFINITY },
      );
      setActiveSection(active.id);
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateActiveSection);
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    if (mobileNavigationOpen || !mobileDrawerMounted) return undefined;

    const timer = window.setTimeout(() => setMobileDrawerMounted(false), 280);
    return () => window.clearTimeout(timer);
  }, [mobileNavigationOpen, mobileDrawerMounted]);
  useEffect(() => {
    if (!selectedFeature) return undefined;

    const scrollY = window.scrollY;
    const htmlOverflow = document.documentElement.style.overflow;
    const bodyStyles = {
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    };
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      Object.assign(document.body.style, bodyStyles);
      document.documentElement.style.overflow = htmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [selectedFeature]);
  useEffect(() => {
    if (!mobileNavigationOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMobileNavigationOpen(false);
    };
    const closeOnDesktopResize = () => {
      if (window.innerWidth >= 1024) setMobileNavigationOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnDesktopResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnDesktopResize);
    };
  }, [mobileNavigationOpen]);
  useEffect(() => {
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      return undefined;
    }

    const revealTargets = document.querySelectorAll(
      ".landing > section, .landing-hero-copy, .landing-preview, .landing-about-highlight, .feature-card, .role-card, .process-card, .control-card, .landing-faq-item, .contact-card, .landing h1, .landing h2, .landing h3, .landing p, .landing-kicker, .hero-checks, .preview-window",
    );
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const bounds = entry.target.getBoundingClientRect();
          const center = bounds.left + bounds.width / 2;
          const direction = center < window.innerWidth / 2 ? "left" : "right";
          entry.target.dataset.scrollDirection = direction;
          entry.target.classList.toggle(
            "scroll-reveal-visible",
            entry.isIntersecting,
          );
        });
      },
      { threshold: 0, rootMargin: "0px 0px -8% 0px" },
    );

    revealTargets.forEach((target) => {
      target.classList.add("scroll-reveal");
      observer.observe(target);
    });

    return () => observer.disconnect();
  }, []);
  function trackHeroPointer(event) {
    if (event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    event.currentTarget.style.setProperty(
      "--tilt-x",
      `${((0.5 - y) * 13).toFixed(2)}deg`,
    );
    event.currentTarget.style.setProperty(
      "--tilt-y",
      `${((x - 0.5) * 16).toFixed(2)}deg`,
    );
    event.currentTarget.style.setProperty(
      "--preview-x",
      `${((x - 0.5) * 11).toFixed(1)}px`,
    );
    event.currentTarget.style.setProperty(
      "--preview-y",
      `${((y - 0.5) * 11).toFixed(1)}px`,
    );
  }
  function resetHeroPointer(event) {
    event.currentTarget.style.setProperty("--tilt-x", "0deg");
    event.currentTarget.style.setProperty("--tilt-y", "0deg");
    event.currentTarget.style.setProperty("--preview-x", "0px");
    event.currentTarget.style.setProperty("--preview-y", "0px");
  }
  const featureCards = [
    {
      id: "warehouse",
      number: "01",
      icon: FiBox,
      title: "Umumiy ombor",
      summary:
        "Qop va kilogrammdagi qoldiq har bir sotuvdan keyin avtomatik yangilanadi.",
      detail:
        "Har bir tovar uchun aniq qoldiq, kelgan mahsulot, sotilgan miqdor va minimal narx cheklovlari ma’lum bo‘ladi. Ombor bo‘limi bo‘yicha qaysi mahsulot qancha qolganini, qaysi mahsulot tez tugayotganini, qaysi mahsulotga kirim kerakligini bir zumda ko‘rishingiz mumkin.",
      bullets: [
        "Tovarlarni baza bo‘yicha saqlash",
        "Kirim va qoldiqni real-time kuzatish",
        "Qop va kg ichidagi hisob",
        "Minimal narx nazorati",
      ],
      visual: ["Kepak · 120 qop", "Yog‘ · 42 kg", "Qoldiq: 38 qop"],
      image: "/images/ombor.png",
    },
    {
      id: "sales",
      number: "02",
      icon: FiShoppingCart,
      title: "Savdo va chek",
      summary:
        "Mahsulotni tez toping, narxni tasdiqlang va rasmiy chek bilan yakunlang.",
      detail:
        "Savdo kassasi orqali qidiruv, tanlash, narxni tekshirish va chek chiqarish amalga oshiriladi. Har bir chekdagi ma’lumotlar baza va hisobotlarda saqlanadi. Bu esa sotuvchi, sana va mahsulot bo‘yicha kuzatuvni osonlashtiradi.",
      bullets: [
        "Tez qidiruv bo‘yicha mahsulot tanlash",
        "Narxni cheklash va tekshirish",
        "Chek ID bilan qidiruv",
        "Sotuvchi va vaqt bo‘yicha hisobot",
      ],
      visual: ["Chek № 000142", "Sotuvchi: Ali", "Jami: 3 250 000 so‘m"],
      image: salesReceiptImage,
    },
    {
      id: "staff",
      number: "03",
      icon: FiUsers,
      title: "Xodimlar hisobi",
      summary:
        "Xodimlarga alohida kirish, davomat, oylik avansi va kundalik hisob.",
      detail:
        "Boshliq va menejerlar xodimlar ishini kuzatib boradi: ishchilar keldi-ketdi, oylik, avans, Abed puli va kelmagan kun uchun jarima bilan bog‘liq hisoblar to‘g‘ri amalga oshiriladi. Har bir odam o‘z hisobi va savdosi bilan ishlaydi.",
      bullets: [
        "Hodim qo‘shish va o‘chirish",
        "Keldi / kelmadi qayd etish",
        "Avans va Abed yozuvlari",
        "Oylik hisoblangan qoldiq",
      ],
      visual: [
        "Ali Valiyev",
        "Oylik: 4 500 000",
        "Kelmagan kun uchun jarima: 250 000",
      ],
      image: employeeTeamImage,
    },
    {
      id: "reports",
      number: "04",
      icon: FiTrendingUp,
      title: "Hisobotlar",
      summary:
        "Kunlik, haftalik va oylik tushum hamda tovar harakati aniq ko‘rinadi.",
      detail:
        "Kirim, sotuv, xodim natijalari va umumiy tushumlar bir jadvalda jamlanadi. Bu orqali qaysi mahsulot ko‘p sotilganini, qaysi davrda tushum oshganini va qaysi tovarni qayta buyurtma qilish kerakligini oson aniqlaysiz.",
      bullets: [
        "Kunlik va haftalik tushum",
        "Mahsulot bo‘yicha kirim-sotuv",
        "Sotuvchi natijalari",
        "Chek va qoldiq tekshirish",
      ],
      visual: [
        "Bugun: 8 410 000 so‘m",
        "Hafta: 62 000 000 so‘m",
        "Kirim: 420 kg",
      ],
      image: "/images/sales-report.jpg",
    },
  ];
  const roleCards = [
    {
      title: "Do‘kon boshlig‘i",
      description: "Do‘kon, xodimlar, narxlar va umumiy hisobni boshqaradi.",
      features: [
        "Ombor va savdoni nazorat qilish",
        "Xodimlar va ish haqini yuritish",
        "Hisobot va sozlamalarni boshqarish",
      ],
      icon: FiBriefcase,
    },
    {
      title: "Menejer",
      description:
        "Boshliq belgilagan ruxsatlar doirasida kundalik ishlarni yuritadi.",
      features: [
        "Tovar va kirimlarni boshqarish",
        "Savdo va narxlar bilan ishlash",
        "Davomat, avans va Abedni qayd etish",
      ],
      icon: FiUsers,
    },
    {
      title: "Xodim",
      description:
        "O‘z loginidan savdo qiladi va shaxsiy ish ko‘rsatkichlarini ko‘radi.",
      features: [
        "Mahsulot qidirib savdo qilish",
        "Chek orqali savdoni tekshirish",
        "Oylik va avans ma’lumotlarini ko‘rish",
      ],
      icon: FiShoppingCart,
    },
  ];
  const processCards = [
    {
      title: "Tovar kirimini kiriting",
      text: "Kelgan ozuqani qop yoki kilogrammda qayd eting. Ombordagi qoldiq avtomatik yangilanadi.",
      icon: FiBox,
    },
    {
      title: "Savdoni chek bilan yoping",
      text: "Tovarlarni tanlang, ruxsat etilgan narxda soting va har bir savdoga alohida chek oling.",
      icon: FiShoppingCart,
    },
    {
      title: "Hisobotlarni kuzating",
      text: "Kunlik, haftalik va oylik tushum hamda tovar harakatini bir joydan tekshiring.",
      icon: FiTrendingUp,
    },
  ];
  const controlCards = [
    {
      title: "Sotuv narxi nazoratda",
      text: "Har bir tovar uchun belgilangan eng past narx saqlanadi. Ruxsat etilmagan narxda savdoni yakunlab bo‘lmaydi.",
      icon: FiShield,
    },
    {
      title: "Oylik va Abed alohida",
      text: "Avans va kelmagan kun jarimasi oylik hisobiga ta’sir qiladi. Har kuni yoziladigan Abed puli esa alohida jamlanadi.",
      icon: FiDollarSign,
    },
  ];
  const commonQuestions = [
    {
      question: "Ombordagi qoldiq qanday yangilanadi?",
      answer:
        "Yangi kirim qo‘shilganda qoldiq oshadi, savdo chek bilan yakunlanganda sotilgan miqdor avtomatik kamayadi.",
    },
    {
      question: "Xodimlar uchun alohida kirish bormi?",
      answer:
        "Ha. Boshliq xodim va menejer akkauntlarini yaratadi. Har bir rolga o‘z vazifasiga mos ruxsatlar beriladi.",
    },
    {
      question: "Tushlik puli oylikdan ayriladimi?",
      answer:
        "Tushlik puli berilishi yoki berilmasligini do‘kon boshlig‘i hal qiladi. Berilgan tushlik puli alohida qayd etilib, oylik hisobidan ushlab qolinmaydi.",
    },
  ];
  const aboutHighlights = [
    {
      title: "Qop va kilogramm hisobi",
      text: "Har bir yem mahsulotini o‘z o‘lchov birligida kirim va sotuv qiling.",
      icon: FiActivity,
    },
    {
      title: "Yem turlari alohida",
      text: "Kepak, yorma va tayyor yemning narxi hamda qoldig‘ini chalkashtirmang.",
      icon: FiCheck,
    },
    {
      title: "Qoldiqni tez biling",
      text: "Sotuvdan so‘ng qaysi mahsulot kamayganini darhol tekshiring.",
      icon: FiTrendingUp,
    },
  ];

  const closeDialogs = () => {
    setSelectedFeature(null);
  };

  return (
    <main className="landing">
      <header
        className={`landing-header ${selectedFeature ? "landing-header-modal-open" : ""}`}
      >
        <a href="#" className="brand">
          <img className="brand-symbol" src="/yemzor-logo.png" alt="" />
          <span>
            <strong>Yemzor</strong>
            <small>SAVDO VA OMBOR BOSHQARUVI</small>
          </span>
        </a>
        <button
          className="landing-menu-trigger"
          type="button"
          aria-label="Menyuni ochish"
          aria-expanded={mobileNavigationOpen}
          aria-controls="landing-navigation"
          onClick={() => {
            if (mobileNavigationOpen) {
              setMobileNavigationOpen(false);
              return;
            }
            setMobileDrawerMounted(true);
            setMobileNavigationOpen(true);
          }}
        >
          <FiMenu />
        </button>
        <nav
          id="landing-navigation"
          className="landing-nav"
          aria-label="Sahifa bo‘limlari"
        >
          {landingSectionNavigation.map(([href, label]) => (
            <a
              href={href}
              key={href}
              className={activeSection === href.slice(1) ? "active" : undefined}
              aria-current={
                activeSection === href.slice(1) ? "location" : undefined
              }
              onClick={() => setMobileNavigationOpen(false)}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="landing-header-actions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button
            className="button button-secondary"
            onClick={() => {
              setMobileNavigationOpen(false);
              onLogin();
            }}
          >
            Kirish <FiChevronRight />
          </button>
        </div>
      </header>
      {mobileDrawerMounted &&
        createPortal(
          <div
            className={`landing-drawer-layer ${mobileNavigationOpen ? "is-open" : ""}`}
          >
            <button
              className="landing-drawer-backdrop"
              type="button"
              aria-label="Menyuni yopish"
              onClick={() => setMobileNavigationOpen(false)}
            />
            <aside
              className={`landing-drawer ${mobileNavigationOpen ? "is-open" : ""}`}
              aria-label="Sahifa bo‘limlari"
            >
              <div className="landing-drawer-brand">
                <img src="/yemzor-logo.png" alt="" />
                <span>
                  <strong>Yemzor</strong>
                  <small>SAVDO VA OMBOR BOSHQARUVI</small>
                </span>
                <button
                  className="landing-drawer-close"
                  type="button"
                  aria-label="Menyuni yopish"
                  onClick={() => setMobileNavigationOpen(false)}
                >
                  <FiX aria-hidden="true" />
                </button>
              </div>
              <nav aria-label="Sahifa bo‘limlari">
                {landingSectionNavigation.map(([href, label]) => (
                  <a
                    href={href}
                    key={href}
                    className={
                      activeSection === href.slice(1) ? "active" : undefined
                    }
                    aria-current={
                      activeSection === href.slice(1) ? "location" : undefined
                    }
                    onClick={() => setMobileNavigationOpen(false)}
                  >
                    {label}
                  </a>
                ))}
              </nav>
            </aside>
          </div>,
          document.body,
        )}

      <section className="landing-hero">
        <div
          ref={heroBannerRef}
          className="landing-hero-banner"
          onPointerMove={trackHeroPointer}
          onPointerLeave={resetHeroPointer}
        >
          <div className="landing-hero-grid">
            <div className="landing-hero-copy">
              <span className="landing-kicker">
                <i /> OZUQA DO‘KONLARI UCHUN BOSHQARUV TIZIMI
              </span>
              <h1>Ombor, savdo va xodimlar hisobi — bitta joyda.</h1>
              <p>
                Yemzor hayvonlar uchun ozuqa savdosini tartibli yuritishga
                yordam beradi: kirim va qoldiqni kuzating, savdoni chek bilan
                qayd eting, jamoa va oylik hisobini boshqaring.
              </p>
              <ul className="hero-checks">
                <li>
                  <span className="check-dot" /> Qop va kilogramm bo‘yicha ombor
                  hisobi
                </li>
                <li>
                  <span className="check-dot" /> Kunlik, haftalik va oylik savdo
                  hisoboti
                </li>
                <li>
                  <span className="check-dot" />
                  <span>Boshliq, menejer va xodim uchun alohida kirish</span>
                </li>
              </ul>
              <button
                className="landing-hero-login"
                type="button"
                onClick={onLogin}
              >
                Kirish <FiChevronRight aria-hidden="true" />
              </button>
            </div>
            <div
              className="landing-preview"
              aria-label="Yemzor savdo boshqaruv paneli namunasi"
            >
              <div className="preview-window">
                <div className="preview-topbar">
                  <span className="preview-brand">
                    <img src="/yemzor-logo.png" alt="" /> Yemzor
                  </span>
                  <span className="preview-online">
                    <i /> Jonli ko‘rinish
                  </span>
                </div>
                <div className="preview-heading">
                  <div>
                    <small>BUGUNGI KO‘RSATKICHLAR</small>
                    <strong>Do‘kon hisoboti</strong>
                  </div>
                  <span className="preview-date">Bugun</span>
                </div>
                <div className="preview-metrics">
                  <div className="preview-metric">
                    <span>
                      <FiTrendingUp />
                    </span>
                    <small>Bugungi tushum</small>
                    <strong>{money(2480000)}</strong>
                    <em>
                      <FiArrowUpRight /> Savdo davom etmoqda
                    </em>
                  </div>
                  <div className="preview-metric">
                    <span>
                      <FiBox />
                    </span>
                    <small>Ombordagi tovar</small>
                    <strong>24 tur</strong>
                    <em>Qoldiq nazoratda</em>
                  </div>
                </div>
                <div className="preview-sales">
                  <div className="preview-sales-heading">
                    <strong>So‘nggi savdolar</strong>
                    <small>Cheklar</small>
                  </div>
                  <div className="preview-sale-row">
                    <span className="preview-sale-icon">
                      <FiCheck />
                    </span>
                    <span>
                      <strong>Kepak</strong>
                      <small>Chek № 00124 · 10:42</small>
                    </span>
                    <b>{money(450000)}</b>
                  </div>
                  <div className="preview-sale-row">
                    <span className="preview-sale-icon">
                      <FiCheck />
                    </span>
                    <span>
                      <strong>Arpa yormasi</strong>
                      <small>Chek № 00123 · 10:18</small>
                    </span>
                    <b>{money(320000)}</b>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-about" id="haqida">
        <div className="landing-about-head">
          <span className="landing-kicker">
            <i /> YEM MAHSULOTLARI HISOBI
          </span>
          <h2>Har xil yem mahsulotlari — bitta tartibli hisobda</h2>
          <p>
            Kepak, arpa yormasi, bug‘doy, kombikorm va chorva uchun boshqa
            ozuqalarni mahsulotma-mahsulot yuriting. Qop yoki kilogrammda kirim
            qo‘shing, savdoni qayd eting va omborda qancha yem qolganini
            tekshiring — barcha ma’lumot bir joyda saqlanadi.
          </p>
        </div>
        <div className="landing-about-highlights">
          {aboutHighlights.map(({ title, text, icon: Icon }) => (
            <article className="landing-about-highlight" key={title}>
              <span>
                <Icon aria-hidden="true" />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-features" id="imkoniyatlar">
        <div className="landing-section-head">
          <span className="landing-kicker">
            <i /> ASOSIY IMKONIYATLAR
          </span>
          <h2>Do‘kon ishini boshqarish uchun kerakli bo‘limlar</h2>
          <p>
            Bo‘lim ustiga bosing — uning imkoniyatlari va qanday ishlashi haqida
            batafsil ma’lumot ochiladi.
          </p>
        </div>
        <div className="feature-grid">
          {featureCards.map((feature) => (
            <Feature
              key={feature.id}
              feature={feature}
              onClick={() => setSelectedFeature(feature)}
            />
          ))}
        </div>
      </section>

      <section className="landing-role-panel" id="rollar">
        <h2>Har kim o‘z vazifasi bo‘yicha ishlaydi</h2>
        <p>
          Uchta alohida rol va ruxsatlar: boshqaruv egasida, kundalik nazorat
          menejerda, savdo xodimda.
        </p>
        <div className="role-grid">
          {roleCards.map(({ title, description, features, icon: Icon }) => (
            <article className="role-card role-card-animated" key={title}>
              <div className="role-icon">
                <Icon />
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
              <ul>
                {features.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-role-flow" aria-label="Yemzor ishlash modeli">
        <div className="landing-role-flow-head">
          <span className="landing-kicker">
            <i /> YEMZOR MODELI
          </span>
          <h2>Barcha boshqaruv jarayoni bitta markazda birlashadi</h2>
        </div>
        <div className="role-flow-grid">
          <article className="flow-node flow-node-top-left">
            <span className="flow-icon"><FiBriefcase /></span>
            <strong>Boshliq</strong>
            <small>Umumiy nazorat va qarorlar</small>
          </article>
          <article className="flow-node flow-node-top-center">
            <span className="flow-icon"><FiBox /></span>
            <strong>Ombor</strong>
            <small>Kirim, qoldiq va tan narx</small>
          </article>
          <article className="flow-node flow-node-top-right">
            <span className="flow-icon"><FiTrendingUp /></span>
            <strong>Savdo</strong>
            <small>Chek, narx va tushum</small>
          </article>
          <div className="flow-center">
            <span>Yemzor</span>
          </div>
          <article className="flow-node flow-node-bottom-left">
            <span className="flow-icon"><FiShoppingCart /></span>
            <strong>Hisobot</strong>
            <small>Kunlik, haftalik va oylik</small>
          </article>
          <article className="flow-node flow-node-bottom-center">
            <span className="flow-icon"><FiUsers /></span>
            <strong>Xodim</strong>
            <small>Davomat va oylik</small>
          </article>
          <article className="flow-node flow-node-bottom-right">
            <span className="flow-icon"><FiDollarSign /></span>
            <strong>To‘lov</strong>
            <small>Avans, Abed va bonus</small>
          </article>
        </div>
      </section>

      <section className="landing-tools landing-process" id="jarayon">
        <span className="landing-kicker">
          <i /> ODDIY VA TARTIBLI ISH JARAYONI
        </span>
        <h2>Do‘kon boshqaruvi uchta oddiy qadamda</h2>
        <p>
          Kirimdan tortib kun yakunidagi hisobotgacha — asosiy ishlar bitta
          tizimda.
        </p>
        <div className="tool-grid">
          {processCards.map(({ title, text, icon: Icon }, index) => (
            <article className="tool-card process-card" key={title}>
              <div className="process-card-head">
                <div className="tool-icon">
                  <Icon />
                </div>
                <span>0{index + 1}</span>
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-tools landing-controls">
        <span className="landing-kicker">
          <i /> ANIQLIK VA NAZORAT
        </span>
        <h2>Har bir muhim hisob nazorat ostida</h2>
        <p>
          Narx siyosati va xodimlar hisobini tushunarli qoidalar bilan yuriting.
        </p>
        <div className="control-grid">
          {controlCards.map(({ title, text, icon: Icon }) => (
            <article className="control-card" key={title}>
              <span className="control-icon">
                <Icon />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        className="landing-showcase landing-showcase-gallery"
        id="mahsulotlar"
      >
        <div className="showcase-copy">
          <span className="landing-kicker">
            <i /> OZUQA DO‘KONLARI UCHUN
          </span>
          <h2>Do‘koningizdagi mahsulotlar — aniq va tartibli hisobda</h2>
          <p>
            Don, yem va chorva uchun ozuqa turlarini yagona omborda yuriting.
            Kirimni qo‘shing, qoldiqni kuzating va sotuvga kerakli miqdorni
            doim bilib turing.
          </p>
          <div className="showcase-tags">
            <span>Don mahsulotlari</span>
            <span>Chorva ozuqasi</span>
            <span>Ombor nazorati</span>
          </div>
        </div>
        <div className="feed-photo-grid" aria-label="Don va chorva suratlari">
          <figure className="feed-photo-main">
            <img
              src={feedGrainImage}
              alt="Ozuqa uchun ishlatiladigan don mahsulotlari"
              loading="lazy"
              decoding="async"
            />
            <figcaption>Don mahsulotlari</figcaption>
          </figure>
          <figure>
            <img
              src={farmCattleImage}
              alt="Yem bilan boqiladigan qoramollar"
              loading="lazy"
              decoding="async"
            />
            <figcaption>Chorva ozuqasi</figcaption>
          </figure>
          <figure>
            <img
              src={feedBranImage}
              alt="Chorva uchun yem bilan boqilayotgan hayvon"
              loading="lazy"
              decoding="async"
            />
            <figcaption>Chorva ozuqasi</figcaption>
          </figure>
        </div>
      </section>

      <section className="landing-showcase landing-showcase-ledger">
        <div className="ledger-visual" aria-label="Ombor va savdo jarayoni">
          <div className="ledger-visual-heading">
            <span className="ledger-status"><i /> Hisob yangilandi</span>
            <FiActivity aria-hidden="true" />
          </div>
          <div className="ledger-row">
            <span className="ledger-icon"><FiBox /></span>
            <span><strong>Tovar kirimi</strong><small>Omborga yangi miqdor qo‘shildi</small></span>
            <b>+120 qop</b>
          </div>
          <div className="ledger-row">
            <span className="ledger-icon ledger-icon-sale"><FiTrendingUp /></span>
            <span><strong>Yangi savdo</strong><small>Chek bilan rasmiylashtirildi</small></span>
            <b>−3 qop</b>
          </div>
          <div className="ledger-balance">
            <span>Joriy qoldiq</span><strong>117 qop</strong>
          </div>
        </div>
        <div className="showcase-copy">
          <span className="landing-kicker">
            <i /> KIRIMDAN HISOBOTGACHA
          </span>
          <h2>Har bir kirim va savdo qoldiqda darhol aks etadi</h2>
          <p>
            Mahsulot kirimini qayd qiling, chek bilan savdoni yakunlang —
            ombordagi miqdor avtomatik yangilanadi. Tarix esa hisobotlarda
            saqlanib boradi.
          </p>
          <ul className="showcase-checks">
            <li><FiCheck /> Kirim va savdo bir-biriga bog‘langan</li>
            <li><FiCheck /> Qoldiq kamayganda oldindan ogohlantirish</li>
            <li><FiCheck /> Eski cheklar oylar bo‘yicha saqlanadi</li>
          </ul>
        </div>
      </section>

      <section className="landing-showcase landing-showcase-sales">
        <div className="showcase-copy">
          <span className="landing-kicker">
            <i /> SAVDO VA CHEK
          </span>
          <h2>Savdoni tasdiqlang, chekni chop eting</h2>
          <p>
            Savatni tekshirib, savdoni rad etish yoki chekni chop etish
            mumkin. Chek chiqarilgandagina savdo saqlanadi va ombor qoldig‘i
            yangilanadi.
          </p>
          <div className="showcase-note">
            <FiShield aria-hidden="true" />
            <span>Har bir savdo serverda tekshiriladi va tarixga yoziladi.</span>
          </div>
        </div>
        <div className="sales-photo">
          <img
            src={salesReceiptImage}
            alt="Do‘kondagi chek va savdo jarayoni"
            loading="lazy"
            decoding="async"
          />
          <span><FiCheck /> Chek bilan tasdiqlangan savdo</span>
        </div>
      </section>

      <section className="landing-showcase landing-showcase-team">
        <div className="team-photo">
          <img
            src={employeeTeamImage}
            alt="Do‘kon jamoasi uchun boshqaruv paneli"
            loading="lazy"
            decoding="async"
          />
          <span><FiUsers /> Jamoa bir tizimda</span>
        </div>
        <div className="showcase-copy">
          <span className="landing-kicker">
            <i /> JAMOA VA HISOB
          </span>
          <h2>Xodimlar, davomat va oylikni bir joyda boshqaring</h2>
          <p>
            Har bir xodim o‘z vazifasiga mos paneldan foydalanadi. Boshliq
            davomat, savdo va oylik hisobini umumiy ko‘rinishda nazorat qiladi.
          </p>
          <div className="team-feature-list">
            <span><FiCalendar /> Davomat va ish kunlari</span>
            <span><FiDollarSign /> Oylik va to‘lovlar</span>
          </div>
        </div>
      </section>

      <section className="landing-mini-section landing-mini-metrics">
        <div className="mini-section-heading">
          <span className="landing-kicker"><i /> KUNDALIK ISHDA</span>
          <h2>Kerakli ma’lumot — tez topiladi</h2>
        </div>
        <div className="mini-metric-grid">
          <article><FiBox /><strong>Ombor</strong><span>Qoldiq va kirimlar</span></article>
          <article><FiTrendingUp /><strong>Savdo</strong><span>Cheklar va tushum</span></article>
          <article><FiUsers /><strong>Jamoa</strong><span>Davomat va oylik</span></article>
        </div>
      </section>

      <section className="landing-mini-section landing-mini-units" id="birliklar">
        <div>
          <span className="landing-kicker"><i /> MOSLASHUVCHAN HISOB</span>
          <h2>Mahsulotingizni o‘z birligida kiriting</h2>
          <p>Har bir tovar uchun mos birlikni tanlang; suyuqliklarda litr yoki millilitr ishlating.</p>
        </div>
        <div className="unit-pills" aria-label="Qo‘llab-quvvatlanadigan birliklar">
          <span>Qop</span><span>Kg / tonna</span><span>litr</span><span>millilitr</span><span>dona</span><span>blok</span>
        </div>
      </section>

      <section className="landing-faq">
        <div className="landing-faq-heading">
          <span className="landing-kicker">
            <i /> KO‘P SO‘RALADIGAN SAVOLLAR
          </span>
          <h2>Yemzor haqida qisqacha</h2>
          <p>Do‘konning kundalik hisobiga oid muhim savollarga javoblar.</p>
        </div>
        <div className="landing-faq-list">
          {commonQuestions.map(({ question, answer }) => (
            <details className="landing-faq-item" key={question}>
              <summary>
                {question}
                <FiChevronRight />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="landing-downloads" id="ilovani-yuklab-olish">
        <div className="landing-downloads-copy">
          <span className="landing-kicker">
            <i /> KOMPYUTER VA TELEFONDA
          </span>
          <h2>Yemzor’ni kompyuter yoki telefonga o‘rnating</h2>
          <p>
            Windows va Android ilovalarini yuklab olish hozircha kutilmoqda.
            Tayyor bo‘lgach, shu sahifadan yuklab olishingiz mumkin.
          </p>
        </div>
        <div className="landing-download-options">
          <button className="landing-download-button" type="button" disabled>
            <FiMonitor aria-hidden="true" />
            <span>
              <strong>Windows uchun .exe</strong>
              <small>Yuklab olish kutilmoqda</small>
            </span>
            <FiDownload aria-hidden="true" />
          </button>
          <button className="landing-download-button" type="button" disabled>
            <FiSmartphone aria-hidden="true" />
            <span>
              <strong>Android uchun .apk</strong>
              <small>Yuklab olish kutilmoqda</small>
            </span>
            <FiDownload aria-hidden="true" />
          </button>
        </div>
      </section>

      <section
        className="landing-contact landing-contact-bottom"
        id="boglanish"
      >
        <div>
          <span className="landing-kicker">
            <i /> ALOQA
          </span>
          <h2>Savolingiz bormi?</h2>
          <p>Demo olishdan oldin Yemzor haqida bizdan so‘rashingiz mumkin.</p>
        </div>
        <div className="contact-cards">
          <a
            className="contact-card"
            href={`https://t.me/${telegram || "naziroff1"}`}
            target="_blank"
            rel="noreferrer"
          >
            <span>
              <FiMessageCircle />
            </span>
            <div>
              <small>TELEGRAM</small>
              <strong>@{telegram || "naziroff1"}</strong>
            </div>
            <FiChevronRight />
          </a>
          {phone && (
            <a
              className="contact-card"
              href={`tel:${phone.replace(/[^\d+]/g, "")}`}
            >
              <span>
                <FiPhone />
              </span>
              <div>
                <small>TELEFON</small>
                <strong>{phone}</strong>
              </div>
              <FiChevronRight />
            </a>
          )}
        </div>
      </section>

      <section className="landing-cta landing-cta-bottom" id="demo">
        <div className="cta-copy">
          <h2>Yemzor bilan ishni boshlang</h2>
          <p>
            Demo akkaunt ochib, do‘kon boshqaruvi imkoniyatlarini sinab ko‘ring.
          </p>
        </div>
        <button
          className="button button-primary demo-cta-button"
          onClick={onDemo}
        >
          Bepul demo oling <FiChevronRight />
        </button>
      </section>

      <section className="landing-legal" aria-label="Huquqiy ma’lumotlar">
        <button
          className="landing-legal-button"
          type="button"
          onClick={() => onLegal("offer")}
        >
          Ommaviy oferta
        </button>
        <button
          className="landing-legal-button"
          type="button"
          onClick={() => onLegal("privacy")}
        >
          Maxfiylik siyosati
        </button>
      </section>

      <footer className="landing-footer">
        <a href="#" className="brand">
          <img className="brand-symbol" src="/yemzor-logo.png" alt="" />
          <span>
            <strong>Yemzor</strong>
            <small>SAVDO VA OMBOR BOSHQARUVI</small>
          </span>
        </a>
        <span>© {now.getFullYear()} Yemzor. Barcha huquqlar himoyalangan.</span>
      </footer>

      {selectedFeature && (
        <Modal
          className="landing-feature-modal"
          backdropClassName="landing-feature-backdrop"
          title={selectedFeature.title}
          subtitle={selectedFeature.summary}
          onClose={closeDialogs}
        >
          <FeatureDetails feature={selectedFeature} />
        </Modal>
      )}
    </main>
  );
}

function Feature({ feature, onClick }) {
  const Icon = feature.icon;
  return (
    <article
      className="feature-card"
      role="button"
      tabIndex={0}
      aria-label={`${feature.title} haqida batafsil`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <img
        className="feature-card-image"
        src={feature.image}
        alt={feature.title}
      />
      <div className="feature-top">
        <span>
          <Icon />
        </span>
        <small>{feature.number}</small>
      </div>
      <h3>{feature.title}</h3>
      <p>{feature.summary}</p>
    </article>
  );
}

function FeatureDetails({ feature }) {
  const Icon = feature.icon;
  return (
    <div className="feature-expanded-content">
      <div className="feature-expanded-grid">
        <div className="feature-expanded-main">
          <div className="feature-expanded-icon">
            <Icon />
          </div>
          <h3>{feature.title}</h3>
          <p>{feature.detail}</p>
        </div>
        <div className="feature-expanded-visual">
          {feature.image && (
            <img
              src={feature.image}
              alt={feature.title}
              className="feature-expanded-image"
            />
          )}
          <div className="feature-mini-stack">
            {feature.visual.map((line) => (
              <div key={line} className="feature-mini-box">
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="feature-expanded-list-wrap">
        <div className="feature-expanded-label">Nima qilsa bo‘ladi</div>
        <ul className="feature-expanded-list">
          {feature.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DemoRegistrationPage({
  onSuccess,
  onBack,
  onExistingDemo,
  theme,
  onToggleTheme,
}) {
  const [saving, setSaving] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState("");

  async function sendCode(form) {
    const email = form.get("email");
    if (!email || typeof email !== "string") {
      setError("Emailni kiriting.");
      return;
    }
    setSendingCode(true);
    setError("");
    try {
      const result = await api("/api/demo/register/request", {
        method: "POST",
        body: { email },
      });
      toast.success(
        result.message || `Tasdiqlash kodi ${email} manziliga yuborildi.`,
      );
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSendingCode(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (form.get("password") !== form.get("confirmPassword")) {
      setError("Parollar bir xil emas.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api("/api/demo/register", {
        method: "POST",
        body: {
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
          verificationCode: String(form.get("verificationCode") || ""),
        },
      });
      toast.success("Demo do‘kon ochildi · 48 soat foydalanishingiz mumkin");
      await onSuccess();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="access-shell">
      <div className="access-theme">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      <section className="access-aside">
        <a className="brand brand-light" href="#">
          <img className="brand-symbol" src="/yemzor-logo.png" alt="" />
          <span>
            <strong>Yemzor</strong>
            <small>48 SOATLIK DEMO</small>
          </span>
        </a>
        <div className="access-message">
          <span className="eyebrow">BEPUL SINAB KO‘RING</span>
          <h1>Do‘kon ishini to‘liq sinab ko‘ring.</h1>
          <p>
            Demo do‘konda tovar, savdo, hisobot va xodimlarni boshqarish
            imkoniyatlari bor. Demo 48 soatdan keyin avtomatik yopiladi.
          </p>
        </div>
        <div className="access-foot">
          Email orqali ro‘yxatdan o‘ting · Tasdiqlash kodi yuboriladi
        </div>
      </section>
      <section className="access-main">
        <form className="access-card" onSubmit={submit}>
          <button type="button" className="back-link" onClick={onBack}>
            ← Bosh sahifaga
          </button>
          <span className="eyebrow">YANGI DEMO HISOBI</span>
          <h2>48 soat bepul sinash</h2>
          <p className="muted">
            Emailga tasdiqlash kodi yuboriladi. Kodni kiritib, demo do‘koni
            ochiladi.
          </p>
          <Field label="Ism-familiya">
            <input
              name="name"
              autoComplete="name"
              required
              minLength="2"
              maxLength="80"
              placeholder="Masalan, Ali Valiyev"
            />
          </Field>
          <div className="field-row demo-email-row">
            <Field label="Email">
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength="254"
                placeholder="ali@example.com"
              />
            </Field>
            <button
              type="button"
              className="button button-secondary demo-send-code"
              disabled={sendingCode}
              onClick={(event) => {
                const form = new FormData(event.currentTarget.form);
                sendCode(form);
              }}
            >
              {sendingCode ? "Kodni yuborish..." : "Kodni yuborish"}
            </button>
          </div>
          <Field label="Tasdiqlash kodi">
            <input
              name="verificationCode"
              inputMode="numeric"
              minLength="6"
              maxLength="6"
              pattern="[0-9]*"
              placeholder="6 xonali kod"
              required
            />
          </Field>
          <Field label="Parol">
            <PasswordInput
              name="password"
              autoComplete="new-password"
              required
              minLength="10"
              maxLength="200"
              placeholder="Kamida 10 ta belgi"
            />
          </Field>
          <Field label="Parolni takrorlang">
            <PasswordInput
              name="confirmPassword"
              autoComplete="new-password"
              required
              minLength="10"
              maxLength="200"
              placeholder="Parolni qayta kiriting"
            />
          </Field>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button button-primary button-wide"
            disabled={saving}
          >
            {saving ? "Hisob yaratilmoqda..." : "Demo do‘konni ochish"}{" "}
            <FiChevronRight />
          </button>
          <p className="security-note">
            Har bir email uchun bitta demo beriladi. Demo tugagach,
            ma’lumotlarga kirish yopiladi.
          </p>
          <button
            type="button"
            className="text-button demo-existing-login"
            onClick={onExistingDemo}
          >
            Demo akkauntingiz bormi? Email va parol bilan kiring{" "}
            <FiChevronRight />
          </button>
        </form>
      </section>
    </main>
  );
}

function AccessPage({
  setupRequired,
  onSuccess,
  onBack,
  showBack,
  theme,
  onToggleTheme,
}) {
  const [form, setForm] = useState({ name: "", login: "", password: "" });
  const [loginRole, setLoginRole] = useState("company_owner");
  const [saving, setSaving] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api(setupRequired ? "/api/setup" : "/api/auth/login", {
        method: "POST",
        body: setupRequired ? form : { ...form, role: loginRole },
      });
      const result = await onSuccess();
      if (!result?.user) {
        throw new Error("Kirish sessiyasi saqlanmadi. Qayta urinib ko‘ring.");
      }
      toast.success(
        setupRequired
          ? "Platforma akkaunti yaratildi"
          : "Tizimga muvaffaqiyatli kirdingiz",
      );
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="access-shell">
      <div className="access-theme">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      <section
        className={`access-aside ${!setupRequired ? `${loginRole}-role` : ""}`}
      >
        <a className="brand brand-light" href="#">
          <img className="brand-symbol" src="/yemzor-logo.png" alt="" />
          <span>
            <strong>Yemzor</strong>
            <small>YEM SAVDOSI NAZORATI</small>
          </span>
        </a>
        {setupRequired || loginRole === "company_owner" ? (
          <div className="access-message">
            <span className="eyebrow">BIR JOYDA. ANIQ HISOBDA.</span>
            <h1>Do‘koningizni bir joydan boshqaring.</h1>
            <p>
              Tovarlar, ombor qoldig‘i, savdo cheklari va xodimlar hisobi —
              barchasi bitta xavfsiz panelda.
            </p>
          </div>
        ) : loginRole === "manager" ? (
          <div className="access-message">
            <span className="eyebrow">MENEJER UCHUN · KUNDALIK BOSHQARUV</span>
            <h1>Ishchilarni bir joydan boshqaring.</h1>
            <p>
              Tovar kirimi va narxlarni boshqaring, savdoni kuzating, xodimlar
              davomatini hamda avans va Abed yozuvlarini yuriting.
            </p>
          </div>
        ) : (
          <div className="access-message">
            <span className="eyebrow">XODIM UCHUN · SAVDO VA HISOB</span>
            <h1>Ish jarayoningiz endi tizimda.</h1>
            <p>
              Savdolaringiz, tasdiqlangan cheklaringiz va shaxsiy oylik
              hisobingizni ko‘ring. Umumiy ombor qoldig‘i har bir xodimda bir
              xil yangilanadi.
            </p>
          </div>
        )}
        <div className="access-foot">
          Xavfsiz kirish · Alohida do‘konlar · Jonli qoldiq
        </div>
      </section>
      <section className="access-main">
        <form className="access-card" onSubmit={submit}>
          {showBack && (
            <button type="button" className="back-link" onClick={onBack}>
              ← Bosh sahifaga
            </button>
          )}
          <span className="eyebrow">
            {setupRequired ? "BIR MARTALIK SOZLASH" : "XUSH KELIBSIZ"}
          </span>
          <h2>
            {setupRequired
              ? "Platforma egasini yarating"
              : "Hisobingizga kiring"}
          </h2>
          <p className="muted">
            {setupRequired
              ? "Birinchi akkaunt kompaniyalar va do‘konlarni boshqaradi."
              : "Rolingizni tanlang va login-parolingiz bilan kiring."}
          </p>
          {!setupRequired && (
            <div className="role-switch" role="group" aria-label="Kirish turi">
              <button
                type="button"
                className={loginRole === "company_owner" ? "selected" : ""}
                onClick={() => setLoginRole("company_owner")}
              >
                Boshliq
              </button>
              <button
                type="button"
                className={loginRole === "manager" ? "selected" : ""}
                onClick={() => setLoginRole("manager")}
              >
                Menejer
              </button>
              <button
                type="button"
                className={loginRole === "employee" ? "selected" : ""}
                onClick={() => setLoginRole("employee")}
              >
                Hodim
              </button>
            </div>
          )}
          {setupRequired && (
            <Field label="Ism-familiya">
              <input
                autoComplete="name"
                required
                minLength="2"
                maxLength="80"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="Masalan, Ali Valiyev"
              />
            </Field>
          )}
          <Field
            label={
              ["company_owner", "manager"].includes(loginRole)
                ? "Email yoki login"
                : "Login"
            }
          >
            <input
              autoComplete="username"
              required
              minLength="3"
              maxLength="254"
              value={form.login}
              onChange={(event) =>
                setForm({ ...form, login: event.target.value })
              }
              placeholder={
                ["company_owner", "manager"].includes(loginRole)
                  ? "Email yoki login"
                  : "login"
              }
            />
          </Field>
          <Field label="Parol">
            <PasswordInput
              autoComplete={setupRequired ? "new-password" : "current-password"}
              required
              minLength={setupRequired ? 10 : 1}
              value={form.password}
              onChange={(event) =>
                setForm({ ...form, password: event.target.value })
              }
              placeholder={setupRequired ? "Kamida 10 ta belgi" : "Parol"}
            />
          </Field>
          <button
            className="button button-primary button-wide"
            disabled={saving}
          >
            {saving
              ? "Kirilmoqda..."
              : setupRequired
                ? "Platformani sozlash"
                : "Kirish"}{" "}
            <FiChevronRight />
          </button>
          {setupRequired && (
            <p className="security-note">
              Parol faqat himoyalangan xesh ko‘rinishida saqlanadi.
            </p>
          )}
        </form>
      </section>
    </main>
  );
}

function SubscriptionGate({
  company,
  subscription,
  supportContacts,
  onRefresh,
  onLogout,
  theme,
  onToggleTheme,
}) {
  useEffect(() => {
    const timer = window.setInterval(() => {
      void onRefresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [onRefresh]);
  const unpaid =
    Number(subscription?.paidAmount) > 0 &&
    subscription.paidAmount !== subscription.requiredAmount;
  return (
    <main className="subscription-shell">
      <div className="access-theme">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      <a className="brand" href="#">
        <img className="brand-symbol" src="/yemzor-logo.png" alt="" />
        <span>
          <strong>Yemzor</strong>
          <small>OBUNA HOLATI</small>
        </span>
      </a>
      <section className="subscription-card">
        <span className="subscription-icon">
          <FiClock />
        </span>
        <span
          className={`status-pill ${subscription?.amountConfigured ? "status-pending" : "status-paid"}`}
        >
          {subscription?.amountConfigured
            ? "TO‘LOV QILISH KERAK"
            : "NARX BELGILANMAGAN"}
        </span>
        <h1>{company?.name || "Do‘kon"} uchun oylik to‘lov</h1>
        <p>
          Do‘kon ishlashini davom ettirish uchun platforma egasi belgilagan
          oylik to‘lovni amalga oshiring. Tasdiqlangach, tizim avtomatik
          ochiladi.
        </p>
        <div className="subscription-amount">
          <span>{subscription?.period || "Joriy oy"} uchun to‘lov</span>
          <strong>
            {subscription?.amountConfigured
              ? money(subscription.requiredAmount)
              : "Narx belgilanmoqda"}
          </strong>
        </div>
        {unpaid && (
          <div className="subscription-warning">
            Qayd etilgan to‘lov: {money(subscription.paidAmount)}. Davom etish
            uchun to‘liq belgilangan summa kerak.
          </div>
        )}
        <div className="subscription-actions">
          <button
            className="button button-primary button-wide"
            onClick={onRefresh}
          >
            <FiCheck /> To‘lov holatini tekshirish
          </button>
          <button
            className="button button-secondary button-wide"
            onClick={onLogout}
          >
            <FiLogOut /> Chiqish
          </button>
        </div>
        <div className="subscription-support">
          <strong>Yemzor bilan bog‘lanish</strong>
          {supportContacts?.phone && (
            <a href={`tel:${supportContacts.phone.replace(/[^\d+]/g, "")}`}>
              {supportContacts.phone}
            </a>
          )}
          {supportContacts?.telegram && (
            <a
              href={`https://t.me/${supportContacts.telegram.replace(/^@/, "")}`}
              target="_blank"
              rel="noreferrer"
            >
              Telegram: @{supportContacts.telegram.replace(/^@/, "")}
            </a>
          )}
        </div>
        <small className="subscription-note">
          To‘lov platforma egasi tomonidan tasdiqlanadi. Sahifa holati avtomatik
          yangilanadi.
        </small>
      </section>
    </main>
  );
}

function DemoExpiredGate({ onLogout, onRestart, theme, onToggleTheme }) {
  return (
    <main className="subscription-shell">
      <div className="access-theme">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      <a className="brand" href="#">
        <img className="brand-symbol" src="/yemzor-logo.png" alt="" />
        <span>
          <strong>Yemzor</strong>
          <small>DEMO HOLATI</small>
        </span>
      </a>
      <section className="subscription-card">
        <span className="subscription-icon">
          <FiClock />
        </span>
        <span className="status-pill status-pending">
          48 SOATLIK DEMO YAKUNLANDI
        </span>
        <h1>Demo muddati tugadi</h1>
        <p>
          Demo hisobingiz 48 soat ishladi. Yangi demo ochish uchun boshqa email
          bilan ro‘yxatdan o‘ting.
        </p>
        <div className="subscription-actions">
          <button
            className="button button-primary button-wide"
            onClick={onRestart}
          >
            Yangi demo ro‘yxatdan o‘tkazish <FiChevronRight />
          </button>
          <button
            className="button button-secondary button-wide"
            onClick={onLogout}
          >
            <FiLogOut /> Bosh sahifaga qaytish
          </button>
        </div>
        <small className="subscription-note">
          Avvalgi demo ma’lumotlari hisob tarixida saqlanadi, ammo do‘kon
          paneliga kirish yopilgan.
        </small>
      </section>
    </main>
  );
}

function PlatformPage({ user, onLogout, onContactSave, theme, onToggleTheme }) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState("");
  const [paymentCompany, setPaymentCompany] = useState(null);
  const [feeCompany, setFeeCompany] = useState(null);
  const [deleteCompany, setDeleteCompany] = useState(null);
  const [platformSettings, setPlatformSettings] = useState({
    phone: "",
    telegram: "naziroff1",
  });
  const [query, setQuery] = useState("");
  const todayMonth = monthKey(useClock());

  const load = useCallback(async () => {
    try {
      const [result, settings] = await Promise.all([
        api("/api/platform/companies"),
        api("/api/platform/settings"),
      ]);
      setCompanies(result.companies);
      setPlatformSettings(settings);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const filtered = companies.filter((company) =>
    company.name
      .toLocaleLowerCase("uz")
      .includes(query.toLocaleLowerCase("uz")),
  );
  async function createCompany(form) {
    form.period = todayMonth;
    await api("/api/platform/companies", { method: "POST", body: form });
    toast.success(
      "Do‘kon yaratildi. Login va parolni xavfsiz yetkazib bering.",
    );
    setModal("");
    await load();
  }
  async function recordPayment(form) {
    await api(`/api/platform/companies/${paymentCompany.id}/subscriptions`, {
      method: "POST",
      body: form,
    });
    toast.success("Oylik to‘lov qayd etildi");
    setPaymentCompany(null);
    await load();
  }
  async function setCompanyFee(form) {
    await api(`/api/platform/companies/${feeCompany.id}/fee`, {
      method: "PATCH",
      body: form,
    });
    toast.success(`${form.period} oyi uchun narx belgilandi`);
    setFeeCompany(null);
    await load();
  }
  async function saveContact(form) {
    const settings = await api("/api/platform/settings", {
      method: "PATCH",
      body: form,
    });
    setPlatformSettings(settings);
    onContactSave((current) => ({ ...current, ...settings }));
    toast.success("Aloqa ma’lumotlari saqlandi");
    setModal("");
  }
  async function clearContactPhone() {
    try {
      await saveContact({ phone: "", telegram: platformSettings.telegram });
    } catch (error) {
      toast.error(error.message);
    }
  }
  async function saveOwnerPassword(form) {
    const payload = {
      currentPassword: form.currentPassword,
      login: user.login,
      newPassword: form.newPassword,
    };
    await api("/api/account/credentials", { method: "PATCH", body: payload });
    toast.success("Owner paroli yangilandi");
    setModal("");
  }
  async function removeCompany() {
    const result = await api(`/api/platform/companies/${deleteCompany.id}`, {
      method: "DELETE",
    });
    toast.success(result.message);
    setDeleteCompany(null);
    await load();
  }

  return (
    <Shell
      user={user}
      onLogout={onLogout}
      platform
      theme={theme}
      onToggleTheme={onToggleTheme}
    >
      <PageHeading
        eyebrow="PLATFORMA BOSHQARUVI"
        title="Do‘konlar"
        description="Brendlarni yarating, oylik tarif va tushgan to‘lovlarni boshqaring."
        action={
          <div className="heading-actions">
            <button
              className="button button-secondary"
              onClick={() => setModal("username")}
            >
              <FiMessageCircle /> Username
            </button>
            <button
              className="button button-secondary"
              onClick={() => setModal("contact")}
            >
              <FiPhone /> Bog‘lanish
            </button>
            <button
              className="button button-secondary"
              onClick={() => setModal("ownerPassword")}
            >
              <FiShield /> Owner parol
            </button>
            <button
              className="button button-primary"
              onClick={() => setModal("company")}
            >
              <FiPlus /> Yangi do‘kon
            </button>
          </div>
        }
      />
      <div className="metric-grid">
        <Metric
          label="Jami do‘kon"
          value={companies.length}
          detail="Platformada ro‘yxatdan o‘tgan"
          icon={FiBriefcase}
        />
        <Metric
          label="Shu oy to‘lagan"
          value={
            companies.filter((item) => item.currentSubscription.active).length
          }
          detail={todayMonth}
          icon={FiCheck}
        />
        <Metric
          label="To‘lov kutilmoqda"
          value={
            companies.filter((item) => !item.currentSubscription.active).length
          }
          detail="Joriy oy uchun"
          icon={FiClock}
        />
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Kompaniyalar</h2>
            <p>
              Har bir kompaniyaning do‘koni alohida ma’lumotlar bilan ishlaydi.
            </p>
          </div>
          <label className="search-box">
            <FiSearch />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Do‘kon qidirish"
            />
          </label>
        </div>
        {loading ? (
          <Loading />
        ) : filtered.length ? (
          <div className="company-grid">
            {filtered.map((company) => {
              const paid = company.currentSubscription.active;
              const feeConfigured = Boolean(company.currentRate);
              return (
                <article className="company-card" key={company.id}>
                  <div className="company-card-top">
                    <span className="company-icon">
                      <FiBriefcase />
                    </span>
                    <span
                      className={`status-pill ${paid ? "status-paid" : "status-pending"}`}
                    >
                      {paid
                        ? "To‘langan"
                        : feeConfigured
                          ? "To‘lov kerak"
                          : "Narx belgilanmagan"}
                    </span>
                  </div>
                  <h3>{company.name}</h3>
                  <p className="muted">
                    Boshliq login: <strong>{company.ownerLogin}</strong>
                  </p>
                  <div className="company-facts">
                    <span>
                      <FiUsers /> {employeeCountLabel(company.employeeCount)}
                    </span>
                    <span>
                      <FiCalendar /> {todayMonth} ·{" "}
                      {feeConfigured
                        ? money(company.currentRate.amount)
                        : "Narx yo‘q"}
                    </span>
                  </div>
                  <div className="company-card-footer">
                    <span>
                      {company.currentSubscription.paidAmount
                        ? `Joriyga hisoblandi: ${money(company.currentSubscription.paidAmount)}`
                        : company.currentSubscription.creditBalance
                          ? `Keyingi oylar uchun avans: ${money(company.currentSubscription.creditBalance)}`
                          : "Joriy oy to‘lovi yo‘q"}
                      {company.currentSubscription.creditBalance > 0 &&
                      company.currentSubscription.paidAmount > 0
                        ? ` · Avans: ${money(company.currentSubscription.creditBalance)}`
                        : ""}
                    </span>
                    <div className="company-payment-actions">
                      <button
                        className="button button-tertiary button-small"
                        onClick={() => setFeeCompany(company)}
                      >
                        {feeConfigured
                          ? "Oy narxini sozlash"
                          : "Oy narxini belgilash"}
                      </button>
                      <button
                        className="button button-secondary button-small"
                        disabled={!feeConfigured}
                        onClick={() => setPaymentCompany(company)}
                      >
                        To‘lovni qayd etish
                      </button>
                      <button
                        className="button button-danger button-small"
                        onClick={() => setDeleteCompany(company)}
                      >
                        Do‘konni o‘chirish
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            title="Do‘kon topilmadi"
            text="Boshqa nom bilan qidirib ko‘ring yoki yangi do‘kon yarating."
          />
        )}
      </section>
      {modal === "company" && (
        <Modal
          title="Yangi do‘kon yaratish"
          subtitle="Joriy oyga tarif belgilanadi. Keyingi oy uchun narx alohida kiritiladi."
          onClose={() => setModal("")}
        >
          <CompanyForm month={todayMonth} onSubmit={createCompany} />
        </Modal>
      )}
      {(modal === "contact" || modal === "username") && (
        <Modal
          title={
            modal === "username"
              ? "Telegram username sozlamalari"
              : "Bog‘lanish sozlamalari"
          }
          subtitle={
            modal === "username"
              ? "Username ni o‘zgartirsangiz, landing va bog‘lanish havolalari ham avtomatik yangilanadi."
              : "Landing sahifasidagi telefon raqam va Telegram username ni shu yerda yangilang."
          }
          onClose={() => setModal("")}
        >
          <ContactSettingsForm
            phone={platformSettings.phone}
            telegram={platformSettings.telegram}
            onSubmit={saveContact}
            onClearPhone={modal === "contact" ? clearContactPhone : undefined}
            submitLabel={
              modal === "username"
                ? "Username ni saqlash"
                : "Aloqa ma’lumotlarini saqlash"
            }
          />
        </Modal>
      )}
      {modal === "ownerPassword" && (
        <Modal
          title="Owner parolni o‘zgartirish"
          subtitle="Platforma egasi uchun yangi parolni kiriting. Eski parolni tasdiqlang."
          onClose={() => setModal("")}
        >
          <OwnerPasswordForm user={user} onSubmit={saveOwnerPassword} />
        </Modal>
      )}
      {paymentCompany && (
        <Modal
          title={`${paymentCompany.name} — to‘lovni qayd etish`}
          subtitle={`${todayMonth} oyi tarifi: ${money(paymentCompany.currentRate?.amount || 0)}. Ortiqcha to‘lov keyingi oylar uchun avans bo‘lib qoladi.`}
          onClose={() => setPaymentCompany(null)}
        >
          <PaymentForm onSubmit={recordPayment} month={todayMonth} />
        </Modal>
      )}
      {feeCompany && (
        <Modal
          title={`${feeCompany.name} — oylik tarif`}
          subtitle="Har bir tarif faqat tanlangan oy uchun amal qiladi."
          onClose={() => setFeeCompany(null)}
        >
          <FeeForm
            month={todayMonth}
            rate={feeCompany.currentRate}
            onSubmit={setCompanyFee}
          />
        </Modal>
      )}
      {deleteCompany && (
        <Modal
          title={`${deleteCompany.name} do‘konini o‘chirish`}
          subtitle="Bu amalni bekor qilib bo‘lmaydi."
          onClose={() => setDeleteCompany(null)}
        >
          <ConfirmCompanyRemoval
            company={deleteCompany}
            onCancel={() => setDeleteCompany(null)}
            onConfirm={removeCompany}
          />
        </Modal>
      )}
    </Shell>
  );
}

function StoreApp({
  user,
  data,
  subscription,
  supportContacts,
  activePage,
  setActivePage,
  onRefresh,
  onLogout,
  modal,
  setModal,
  selected,
  setSelected,
  onUserUpdate,
  theme,
  onToggleTheme,
}) {
  const isOwner = user.role === "company_owner";
  const isManager = user.role === "manager";
  const owner = isOwner || isManager;
  const nav = isOwner
    ? [
        ["overview", "Umumiy ko‘rinish", FiActivity],
        ["sales", "Savdo", FiShoppingCart],
        ["products", "Tovarlar va kirim", FiBox],
        ["history", "Cheklar va hisobot", FiClock],
        ["staff", "Hodimlar va oylik", FiUsers],
        ["account", "Hisob sozlamalari", FiShield],
      ]
    : isManager
      ? [
          ["overview", "Umumiy ko‘rinish", FiActivity],
          ["sales", "Savdo", FiShoppingCart],
          ["products", "Tovarlar va kirim", FiBox],
          ["history", "Cheklar va hisobot", FiClock],
          ["staff", "Hodimlar va oylik", FiUsers],
        ]
      : [
          ["overview", "Umumiy ko‘rinish", FiActivity],
          ["sales", "Savdo", FiShoppingCart],
          ["products", "Ombor qoldig‘i", FiBox],
          ["history", "Cheklar tarixi", FiClock],
          ["payroll", "Mening hisobim", FiDollarSign],
        ];
  const products = data.products;
  const sales = data.sales;
  const employees = data.employees;
  const managers = data.managers || [];
  const now = useClock();
  const seenStockNotifications = useRef(null);

  useEffect(() => {
    const notifications = data.notifications || [];
    if (seenStockNotifications.current === null) {
      seenStockNotifications.current = new Set(
        notifications.map((notification) => notification.id),
      );
      return;
    }
    for (const notification of notifications) {
      if (seenStockNotifications.current.has(notification.id)) continue;
      if (notification.kind === "stockout") toast.error(notification.message);
      else if (notification.kind === "stock") toast.success(notification.message);
      seenStockNotifications.current.add(notification.id);
    }
  }, [data.notifications]);

  useEffect(() => {
    let notified = false;
    const timer = window.setInterval(() => {
      onRefresh()
        .then(() => {
          notified = false;
        })
        .catch((error) => {
          if (!notified) toast.error(error.message);
          notified = true;
        });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [onRefresh]);

  async function submitProduct(form, editing) {
    await api(editing ? `/api/products/${editing.id}` : "/api/products", {
      method: editing ? "PATCH" : "POST",
      body: form,
    });
    toast.success(editing ? "Tovar yangilandi" : "Tovar kirimi saqlandi");
    setModal("");
    setSelected(null);
    await onRefresh();
  }
  async function submitStock(form) {
    await api(`/api/products/${selected.id}/stock`, {
      method: "POST",
      body: form,
    });
    toast.success("Tovar kirimi saqlandi");
    setModal("");
    setSelected(null);
    await onRefresh();
  }
  async function archiveProduct(product) {
    if (!window.confirm(`${product.name} faol ombordan olib tashlansinmi? Eski savdo va kirim tarixi saqlanadi.`)) return;
    try {
      const result = await api(`/api/products/${product.id}`, { method: "DELETE" });
      toast.success(result.message);
      await onRefresh();
    } catch (error) {
      toast.error(error.message);
    }
  }
  async function submitEmployee(form, editing) {
    await api(editing ? `/api/employees/${editing.id}` : "/api/employees", {
      method: editing ? "PATCH" : "POST",
      body: form,
    });
    toast.success(
      editing ? "Hodim ma’lumoti yangilandi" : "Hodim akkaunti yaratildi",
    );
    setModal("");
    setSelected(null);
    await onRefresh();
  }
  async function submitManager(form, editing) {
    await api(editing ? `/api/managers/${editing.id}` : "/api/managers", {
      method: editing ? "PATCH" : "POST",
      body: form,
    });
    toast.success(
      editing ? "Menejer ma’lumoti yangilandi" : "Menejer akkaunti yaratildi",
    );
    setModal("");
    setSelected(null);
    await onRefresh();
  }
  async function submitMovement(form) {
    await api(`/api/employees/${selected.id}/movements`, {
      method: "POST",
      body: form,
    });
    toast.success(
      form.kind === "advance"
        ? "Oylik avansi qayd etildi"
        : "Abed puli alohida qayd etildi",
    );
    setModal("");
    setSelected(null);
    await onRefresh();
  }
  async function submitAttendance(employee, status, date, reason = "") {
    await api(`/api/employees/${employee.id}/attendance`, {
      method: "PUT",
      body: { status, date, reason },
    });
    toast.success(
      `${employee.name}: ${
        status === "present"
          ? "kelgan"
          : status === "excused"
            ? "sababli kelmagan"
            : "kelmagan"
      } deb qayd etildi`,
    );
    await onRefresh();
  }
  async function removeEmployee() {
    const result = await api(`/api/employees/${selected.id}`, {
      method: "DELETE",
    });
    toast.success(result.message);
    setModal("");
    setSelected(null);
    await onRefresh();
  }
  async function removeManager() {
    const result = await api(`/api/managers/${selected.id}`, {
      method: "DELETE",
    });
    toast.success(result.message);
    setModal("");
    setSelected(null);
    await onRefresh();
  }

  const heading = nav.find(([id]) => id === activePage)?.[1] || nav[0][1];
  return (
    <Shell
      user={user}
      company={data.company}
      subscription={subscription}
      supportContacts={supportContacts}
      notifications={data.notifications || []}
      products={products}
      onLogout={onLogout}
      nav={nav}
      activePage={activePage}
      setActivePage={setActivePage}
      theme={theme}
      onToggleTheme={onToggleTheme}
    >
      {activePage === "overview" && (
        <Overview user={user} data={data} onNavigate={setActivePage} />
      )}
      {activePage === "sales" && (
        <SalesPage
          user={user}
          companyName={data.company?.name}
          products={products}
          employees={employees}
          onSale={async (payload) => {
            const result = await api("/api/sales", {
              method: "POST",
              body: payload,
            });
            await onRefresh();
            return result.sale;
          }}
        />
      )}
      {activePage === "products" && (
        <ProductsPage
          owner={owner}
          products={products}
          onAdd={() => {
            setSelected(null);
            setModal("product");
          }}
          onStock={(product) => {
            setSelected(product);
            setModal("stock");
          }}
          onEdit={(product) => {
            setSelected(product);
            setModal("editProduct");
          }}
          onArchive={archiveProduct}
        />
      )}
      {activePage === "history" && (
        <HistoryPage
          sales={sales}
          receipts={data.receipts}
          products={products}
          companyName={data.company?.name}
          owner={owner}
          employees={employees}
        />
      )}
      {activePage === "staff" && owner && (
        <StaffPage
          employees={employees}
          managers={managers}
          movements={data.movements}
          attendance={data.attendance}
          sales={sales}
          month={monthKey(now)}
          absentDeduction={data.company?.absentDeduction || 0}
          restDayWorkBonusEnabled={data.company?.restDayWorkBonusEnabled || false}
          restDayWorkBonusAmount={data.company?.restDayWorkBonusAmount || 0}
          abedPaymentsEnabled={data.company?.abedPaymentsEnabled !== false}
          canManageAttendance={isOwner || isManager}
          canManagePayroll={isOwner || isManager}
          canManageEmployees={isOwner}
          canManageManagers={isOwner}
          onAdd={() => {
            setSelected(null);
            setModal("employee");
          }}
          onAddManager={() => {
            setSelected(null);
            setModal("manager");
          }}
          onMovement={(employee, kind) => {
            setSelected(employee);
            setModal(kind);
          }}
          onEdit={(employee) => {
            setSelected(employee);
            setModal("editEmployee");
          }}
          onRemove={(employee) => {
            setSelected(employee);
            setModal("removeEmployee");
          }}
          onEditManager={(manager) => {
            setSelected(manager);
            setModal("editManager");
          }}
          onRemoveManager={(manager) => {
            setSelected(manager);
            setModal("removeManager");
          }}
          onAttendance={submitAttendance}
        />
      )}
      {activePage === "account" && owner && isOwner && (
        <AccountSettingsPage
          user={user}
          company={data.company}
          onUserUpdate={onUserUpdate}
          onCompanyUpdate={(company) =>
            setData((current) =>
              current
                ? { ...current, company: { ...current.company, ...company } }
                : current,
            )
          }
          onResetData={onRefresh}
        />
      )}
      {activePage === "payroll" && !owner && (
        <MyAccountPage
          user={user}
          sales={sales}
          movements={data.movements}
          attendance={data.attendance}
          month={monthKey(now)}
          absentDeduction={data.company?.absentDeduction || 0}
          restDayWorkBonusEnabled={data.company?.restDayWorkBonusEnabled || false}
          restDayWorkBonusAmount={data.company?.restDayWorkBonusAmount || 0}
          abedPaymentsEnabled={data.company?.abedPaymentsEnabled !== false}
        />
      )}
      {!nav.some(([id]) => id === activePage) && (
        <PageHeading
          eyebrow="DO‘KON"
          title={heading}
          description="Ushbu bo‘lim mavjud emas."
        />
      )}
      {modal === "product" && (
        <Modal
          title="Yangi tovar kirimi"
          subtitle="Kelgan miqdor, sotuv narxi va eng past ruxsat etilgan narxni belgilang."
          onClose={() => setModal("")}
        >
          <ProductForm onSubmit={(form) => submitProduct(form, null)} />
        </Modal>
      )}
      {modal === "editProduct" && selected && (
        <Modal
          title="Tovarni tahrirlash"
          subtitle="Narx chegarasi do‘kondagi barcha sotuvchilarga bir xil qo‘llanadi."
          onClose={() => setModal("")}
        >
          <ProductForm
            product={selected}
            onSubmit={(form) => submitProduct(form, selected)}
          />
        </Modal>
      )}
      {modal === "stock" && selected && (
        <Modal
          title={`${selected.name} — yangi kirim`}
          subtitle={`Joriy qoldiq: ${quantityLabel(selected)}`}
          onClose={() => setModal("")}
        >
          <StockForm product={selected} onSubmit={submitStock} />
        </Modal>
      )}
      {modal === "employee" && (
        <Modal
          title="Yangi hodim qo‘shish"
          subtitle="Login faqat shu do‘konda ishlaydi. Oylik avanslari maosh hisobidan ayriladi."
          onClose={() => setModal("")}
        >
          <EmployeeForm onSubmit={(form) => submitEmployee(form, null)} />
        </Modal>
      )}
      {modal === "manager" && isOwner && (
        <Modal
          title="Yangi menejer qo‘shish"
          subtitle="Menejer tovar, kirim, savdo va xodimlar hisobini ko‘ra oladi, lekin boshliq parolini va jarima sozlamalarini o‘zgartira olmaydi."
          onClose={() => setModal("")}
        >
          <ManagerForm onSubmit={(form) => submitManager(form, null)} />
        </Modal>
      )}
      {modal === "editEmployee" && selected && (
        <Modal
          title={`${selected.name} ma’lumotlari`}
          subtitle="Hodim ismi va oylik miqdorini yangilang."
          onClose={() => setModal("")}
        >
          <EmployeeForm
            employee={selected}
            onSubmit={(form) => submitEmployee(form, selected)}
          />
        </Modal>
      )}
      {modal === "editManager" && selected && isOwner && (
        <Modal
          title={`${selected.name} ma’lumotlari`}
          subtitle="Menejer ismi va oylik miqdorini yangilang."
          onClose={() => setModal("")}
        >
          <ManagerForm
            manager={selected}
            onSubmit={(form) => submitManager(form, selected)}
          />
        </Modal>
      )}
      {(modal === "advance" || modal === "abed") && selected && (
        <Modal
          title={
            modal === "advance"
              ? `${selected.name} — oylik avansi`
              : `${selected.name} — Abed puli`
          }
          subtitle={
            modal === "advance"
              ? "Avans joriy oylikdan ushlab qolinadi."
              : "Abed alohida tarixda saqlanadi va oylikdan ayrilmaydi."
          }
          onClose={() => setModal("")}
        >
          <MovementForm
            kind={modal}
            month={monthKey(now)}
            onSubmit={submitMovement}
          />
        </Modal>
      )}
      {modal === "removeEmployee" && selected && (
        <Modal
          title={`${selected.name}ni butunlay chiqarish`}
          subtitle="Hodim akkauntini va tegishli yozuvlarini o‘chirish qaytarilmaydi."
          onClose={() => setModal("")}
        >
          <ConfirmEmployeeRemoval
            onCancel={() => setModal("")}
            onConfirm={removeEmployee}
          />
        </Modal>
      )}
      {modal === "removeManager" && selected && isOwner && (
        <Modal
          title={`${selected.name} menejerini o‘chirish`}
          subtitle="Bu amal menejer akkauntini veb-ilovadan butunlay olib tashlaydi."
          onClose={() => setModal("")}
        >
          <ConfirmManagerRemoval
            onCancel={() => setModal("")}
            onConfirm={removeManager}
          />
        </Modal>
      )}
    </Shell>
  );
}

function AccountSettingsPage({
  user,
  company,
  onUserUpdate,
  onCompanyUpdate,
  onResetData,
}) {
  const [saving, setSaving] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const [companyError, setCompanyError] = useState("");
  const [resetError, setResetError] = useState("");
  async function submit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const newPassword = form.get("newPassword");
    if (newPassword && newPassword !== form.get("confirmPassword")) {
      setError("Yangi parollar bir xil emas.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await api("/api/account/credentials", {
        method: "PATCH",
        body: {
          currentPassword: form.get("currentPassword"),
          login: form.get("login"),
          ...(newPassword ? { newPassword } : {}),
        },
      });
      onUserUpdate(result.user);
      formElement.reset();
      formElement.elements.login.value = result.user.login;
      toast.success("Kirish ma’lumotlari xavfsiz saqlandi");
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }
  async function submitCompanySettings(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSavingCompany(true);
    setCompanyError("");
    try {
      const result = await api("/api/company/settings", {
        method: "PATCH",
        body: {
          absentDeduction: readNumber(form.get("absentDeduction")),
          restDayWorkBonusEnabled: form.get("restDayWorkBonusEnabled") === "on",
          restDayWorkBonusAmount: readNumber(form.get("restDayWorkBonusAmount")),
          abedPaymentsEnabled: form.get("abedPaymentsEnabled") === "on",
        },
      });
      onCompanyUpdate?.(result.company);
      toast.success(
        "Do‘kon sozlamalari saqlandi",
      );
    } catch (cause) {
      setCompanyError(cause.message);
    } finally {
      setSavingCompany(false);
    }
  }
  async function submitReset(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (form.get("confirmation") !== "0 ga tushurish") {
      setResetError(
        "Tasdiqlash uchun “0 ga tushurish” iborasini aynan kiriting.",
      );
      return;
    }
    setResetting(true);
    setResetError("");
    try {
      const result = await api("/api/company/reset", {
        method: "POST",
        body: {
          currentPassword: form.get("currentPassword"),
          confirmation: form.get("confirmation"),
        },
      });
      formElement.reset();
      await onResetData();
      toast.success(result.message);
    } catch (cause) {
      setResetError(cause.message);
    } finally {
      setResetting(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="AKKAUNT XAVFSIZLIGI"
        title="Hisob sozlamalari"
        description="Kirish ma’lumotlari, ish haqi va to‘lov sozlamalarini boshqaring."
      />
      <section className="panel account-settings">
        <form className="modal-form" onSubmit={submit}>
          <Field label="Yangi login yoki email">
            <input
              name="login"
              type="text"
              autoComplete="username"
              required
              minLength="3"
              maxLength="254"
              defaultValue={user.login}
            />
          </Field>
          <Field label="Joriy parol">
            <PasswordInput
              name="currentPassword"
              autoComplete="current-password"
              required
            />
          </Field>
          <div className="field-row">
            <Field label="Yangi parol">
              <PasswordInput
                name="newPassword"
                autoComplete="new-password"
                minLength="10"
                maxLength="200"
                placeholder="O‘zgartirmasangiz bo‘sh qoldiring"
              />
            </Field>
            <Field label="Yangi parolni takrorlang">
              <PasswordInput
                name="confirmPassword"
                autoComplete="new-password"
                minLength="10"
                maxLength="200"
              />
            </Field>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="security-note">
            Parol ochiq matn ko‘rinishida saqlanmaydi. Yangisi himoyalangan xesh
            ko‘rinishida bazaga yoziladi.
          </div>
          <div className="modal-actions">
            <button className="button button-primary" disabled={saving}>
              {saving ? "Saqlanmoqda..." : "O‘zgarishlarni saqlash"} <FiCheck />
            </button>
          </div>
        </form>
      </section>
      <section className="panel account-settings">
        <form
          key={`${company?.absentDeduction}-${company?.restDayWorkBonusEnabled}-${company?.restDayWorkBonusAmount}-${company?.abedPaymentsEnabled}`}
          className="modal-form"
          onSubmit={submitCompanySettings}
        >
          <h2>Ish haqi va to‘lov sozlamalari</h2>
          <Field label="Har bir kelmagan kun uchun jarima">
            <MoneyField
              name="absentDeduction"
              defaultValue={company?.absentDeduction || 0}
              required
            />
          </Field>
          <label className="settings-option">
            <input
              name="restDayWorkBonusEnabled"
              type="checkbox"
              defaultChecked={company?.restDayWorkBonusEnabled || false}
            />
            <span>Haftalik dam olish kunida ishlagan xodimga bonus berish</span>
          </label>
          <Field label="Dam olish kunidagi ish bonusi (har bir kelgan kun uchun)">
            <MoneyField
              name="restDayWorkBonusAmount"
              defaultValue={company?.restDayWorkBonusAmount || 0}
              required
            />
          </Field>
          <label className="settings-option">
            <input
              name="abedPaymentsEnabled"
              type="checkbox"
              defaultChecked={company?.abedPaymentsEnabled !== false}
            />
            <span>Tushlik/Abed to‘lovlarini yoqish</span>
          </label>
          <p className="security-note">
            Bu miqdor bir marta kiritilganda, har bir kelmagan kun uchun jarima
            yig‘ilib boradi va oylikdan ayriladi. Dam olish kunidagi bonus
            faqat xodim dam olish kunida kelgan deb belgilansa qo‘shiladi.
            Tushlik to‘lovini o‘chirish yangi Abed to‘lovlarini bloklaydi;
            avvalgi yozuvlar tarixda saqlanadi.
          </p>
          {companyError && (
            <p className="form-error" role="alert">
              {companyError}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button button-secondary"
              disabled={savingCompany}
            >
              {savingCompany ? "Saqlanmoqda..." : "Sozlamalarni saqlash"}{" "}
              <FiCheck />
            </button>
          </div>
        </form>
      </section>
      <section className="panel account-settings account-reset-panel">
        <div className="panel-head">
          <div>
            <h2>Hisobni 0 ga tushurish</h2>
            <p>
              Tovarlar, xodimlar va menejerlar hamda savdo, kirim, davomat va
              to‘lov yozuvlari o‘chadi.
            </p>
          </div>
        </div>
        <form className="modal-form" onSubmit={submitReset}>
          <Field label="Joriy parol">
            <PasswordInput
              name="currentPassword"
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="Tasdiqlash uchun “0 ga tushurish” deb yozing">
            <input name="confirmation" required autoComplete="off" />
          </Field>
          <p className="security-note">
            Egasi akkaunti, do‘kon nomi va obuna/to‘lov yozuvlari saqlanadi.
            Operatsion sozlamalar xavfsiz standart qiymatlarga qaytadi.
            O‘chirilgan ma’lumotlarni tiklab bo‘lmaydi.
          </p>
          {resetError && (
            <p className="form-error" role="alert">
              {resetError}
            </p>
          )}
          <div className="modal-actions">
            <button className="button button-danger" disabled={resetting}>
              {resetting ? "Hisob tozalanmoqda..." : "Hisobni 0 ga tushurish"}{" "}
              <FiTrash2 />
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

function Shell({
  user,
  company,
  subscription,
  supportContacts,
  notifications = [],
  products = [],
  onLogout,
  nav,
  activePage,
  setActivePage,
  platform = false,
  children,
  theme,
  onToggleTheme,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileTabbarRef = useRef(null);
  const mobileDockIndicatorRef = useRef(null);
  const previousDockPositionRef = useRef(null);
  const now = useClock();
  const remainingMinutes = company?.isDemo
    ? Math.max(
        0,
        Math.ceil(
          (new Date(company.demoExpiresAt).getTime() - now.getTime()) / 60_000,
        ),
      )
    : 0;
  const demoTimeLeft = `${Math.floor(remainingMinutes / 60)} soat ${remainingMinutes % 60} daqiqa qoldi`;
  useLayoutEffect(() => {
    const tabbar = mobileTabbarRef.current;
    const indicator = mobileDockIndicatorRef.current;
    const activeButton = tabbar?.querySelector(".mobile-tabbar-item.active");
    if (!tabbar || !indicator || !activeButton) return undefined;

    let animation;
    const updatePosition = (animate) => {
      const tabbarBounds = tabbar.getBoundingClientRect();
      const buttonBounds = activeButton.getBoundingClientRect();
      const nextX =
        buttonBounds.left + buttonBounds.width / 2 - tabbarBounds.left - 23;
      const previousX = previousDockPositionRef.current;
      indicator.style.transform = `translate3d(${nextX}px, 0, 0)`;

      if (
        animate &&
        previousX !== null &&
        previousX !== nextX &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        animation?.cancel();
        const direction = nextX > previousX ? 1 : -1;
        animation = indicator.animate(
          [
            {
              transform: `translate3d(${previousX}px, 0, 0) scaleX(1.08) scaleY(.92)`,
              offset: 0,
            },
            {
              transform: `translate3d(${nextX - direction * 8}px, 0, 0) scaleX(.88) scaleY(1.12)`,
              offset: 0.78,
            },
            {
              transform: `translate3d(${nextX}px, 0, 0) scaleX(1) scaleY(1)`,
              offset: 1,
            },
          ],
          { duration: 620, easing: "cubic-bezier(.2, .8, .2, 1)" },
        );
      }

      previousDockPositionRef.current = nextX;
    };

    updatePosition(previousDockPositionRef.current !== null);
    const handleResize = () => updatePosition(false);
    window.addEventListener("resize", handleResize);
    return () => {
      animation?.cancel();
      window.removeEventListener("resize", handleResize);
    };
  }, [activePage]);
  return (
    <div className="app-shell">
      {mobileMenuOpen && (
        <button
          className="mobile-menu-backdrop"
          aria-label="Menyuni yopish"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}>
        <a
          href="#"
          className="brand"
          onClick={(event) => {
            event.preventDefault();
            if (setActivePage) setActivePage(platform ? undefined : "overview");
          }}
        >
          <img className="brand-symbol" src="/yemzor-logo.png" alt="" />
          <span>
            <strong>Yemzor</strong>
            <small>{platform ? "PLATFORMA BOSHQARUVI" : "SAVDO HISOBI"}</small>
          </span>
        </a>
        <div className="side-caption">
          {platform ? "BOSHQARUV" : company?.name || "DO‘KON"}
        </div>
        {nav && (
          <nav className="side-nav" aria-label="Asosiy menyu">
            {nav.map(([id, label, Icon]) => (
              <button
                key={id}
                className={`nav-link ${activePage === id ? "active" : ""}`}
                onClick={() => {
                  setActivePage(id);
                  setMobileMenuOpen(false);
                }}
              >
                <Icon />
                <span>{label}</span>
                <FiChevronRight className="nav-chevron" />
              </button>
            ))}
          </nav>
        )}
        {platform && (
          <div className="platform-note">
            <FiBriefcase />
            <span>
              Kompaniyalar bir-birining savdo va ombor ma’lumotlarini ko‘ra
              olmaydi.
            </span>
          </div>
        )}
        <div className="sidebar-spacer" />
        {!company?.isDemo && (
          <div className="sidebar-system-state">
            <span className="online-state">
              <i /> Tizim faol
            </span>
          </div>
        )}
        <div className="sidebar-user">
          <div className="avatar">
            {(user.name || "Y").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <strong>{user.name}</strong>
            <span>
              {user.role === "platform_admin"
                ? "Platforma egasi"
                : user.role === "company_owner"
                  ? "Do‘kon boshlig‘i"
                  : user.role === "manager"
                    ? "Menejer"
                    : "Hodim"}
            </span>
          </div>
        </div>
        <button
          className="logout-button"
          onClick={() => {
            setMobileMenuOpen(false);
            onLogout();
          }}
        >
          <FiLogOut /> Chiqish
        </button>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="mobile-topbar-brand">
            <button
              className="mobile-menu-trigger"
              aria-label={mobileMenuOpen ? "Menyuni yopish" : "Menyuni ochish"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              {mobileMenuOpen ? <FiX /> : <FiMenu />}
            </button>
            <a
              href="#"
              className="brand"
              onClick={(event) => {
                event.preventDefault();
                setMobileMenuOpen(false);
                setActivePage(platform ? undefined : "overview");
              }}
            >
              <img className="brand-symbol" src="/yemzor-logo.png" alt="" />
              <span>
                <strong>Yemzor</strong>
                <small>
                  {platform ? "PLATFORMA BOSHQARUVI" : "SAVDO HISOBI"}
                </small>
              </span>
            </a>
          </div>
          <div className="topbar-context">
            <span>{platform ? "Yemzor" : company?.name}</span>
            <FiChevronRight />
            <strong>
              {platform
                ? "Boshqaruv"
                : nav?.find(([id]) => id === activePage)?.[1] ||
                  "Umumiy ko‘rinish"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="today-label">
              {new Intl.DateTimeFormat(currentLocale(), {
                dateStyle: "medium",
              }).format(now)}
            </span>
            {company?.isDemo && (
              <span className="status-pill status-pending demo-countdown">
                Demo · {demoTimeLeft}
              </span>
            )}
            {!platform && user.role === "company_owner" && (
              <NotificationCenter
                company={company}
                subscription={subscription}
                supportContacts={supportContacts}
                notifications={notifications}
                products={products}
                now={now}
              />
            )}
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>
      {nav && (
        <nav
          ref={mobileTabbarRef}
          className="mobile-tabbar"
          aria-label="Tezkor menyu"
        >
          <span
            ref={mobileDockIndicatorRef}
            className="mobile-dock-indicator"
            aria-hidden="true"
          />
          {nav.slice(0, 5).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              className={`mobile-tabbar-item ${activePage === id ? "active" : ""}`}
              aria-label={label}
              aria-current={activePage === id ? "page" : undefined}
              onClick={() => {
                setActivePage(id);
                setMobileMenuOpen(false);
              }}
            >
              <Icon aria-hidden="true" />
              <span>
                {{
                  overview: "Asosiy",
                  sales: "Savdo",
                  products: "Tovar",
                  history: "Cheklar",
                  staff: "Xodimlar",
                  account: "Hisob",
                  payroll: "Hisob",
                }[id] || label}
              </span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function Metric({ label, value, detail, icon: Icon, tone = "" }) {
  return (
    <article className="metric-card">
      <span className={`metric-icon ${tone}`}>
        <Icon />
      </span>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Overview({ user, data, onNavigate }) {
  const now = useClock();
  const month = monthKey(now);
  const today = dayKey(now);
  const sales = data.sales;
  const receipts = data.receipts;
  const todays = sales.filter(
    (sale) => dayKey(new Date(sale.createdAt)) === today,
  );
  const weekly = sales.filter(
    (sale) => new Date(sale.createdAt) >= startOfWeek(now),
  );
  const monthly = sales.filter(
    (sale) => monthKey(new Date(sale.createdAt)) === month,
  );
  const getSaleProfit = (sale) => {
    if (typeof sale.profit === "number") return sale.profit;
    const purchaseTotal = (sale.items || []).reduce(
      (sum, item) => sum + (Number(item.cost) || Math.round((Number(item.quantity) || 0) * (Number(item.costPrice) || 0))),
      0,
    );
    return Math.max(0, Number(sale.total || 0) - purchaseTotal);
  };
  const todayProfit = todays.reduce((sum, sale) => sum + getSaleProfit(sale), 0);
  const weeklyProfit = weekly.reduce((sum, sale) => sum + getSaleProfit(sale), 0);
  const monthlyProfit = monthly.reduce((sum, sale) => sum + getSaleProfit(sale), 0);
  const todayReceipts = receipts.filter(
    (receipt) => dayKey(new Date(receipt.createdAt)) === today,
  );
  const weeklyReceipts = receipts.filter(
    (receipt) => new Date(receipt.createdAt) >= startOfWeek(now),
  );
  const monthlyReceipts = receipts.filter(
    (receipt) => monthKey(new Date(receipt.createdAt)) === month,
  );
  const summarizeIncoming = (entries) => {
    const items = new Map();
    for (const receipt of entries) {
      const key = receipt.productId || receipt.name;
      const item = items.get(key) || {
        name: receipt.name,
        unit: receipt.unit,
        quantity: 0,
      };
      item.quantity += Number(receipt.quantity);
      items.set(key, item);
    }
    const goods = [...items.values()];
    return {
      value:
        goods.length === 1
          ? `${goods[0].name} — ${formatQuantity(goods[0].quantity, goods[0].unit)} ${unitName(goods[0].unit)}`
          : goods.length
            ? `${goods.length} xil tovar`
            : "Hozircha yo‘q",
      detail:
        goods.length > 1
          ? goods
              .map(
                (item) =>
                  `${item.name} — ${formatQuantity(item.quantity, item.unit)} ${unitName(item.unit)}`,
              )
              .join(" · ")
          : goods.length
            ? `${entries.length} marta kelgan`
            : "Tanlangan davrda kelmagan",
    };
  };
  const todayIncomingSummary = summarizeIncoming(todayReceipts);
  const weeklyIncomingSummary = summarizeIncoming(weeklyReceipts);
  const monthlyIncomingSummary = summarizeIncoming(monthlyReceipts);
  const stock = data.products.reduce(
    (count, product) => count + Number(product.quantity),
    0,
  );
  const recent = sales.slice(0, 5);
  return (
    <>
      <PageHeading
        eyebrow={new Intl.DateTimeFormat(currentLocale(), {
          dateStyle: "full",
        }).format(now)}
        title={`Xayrli kun, ${user.name.split(" ")[0]}!`}
        description="Bugungi savdo va ombor holati bilan tanishing."
        action={
          <button
            className="button button-primary"
            onClick={() => onNavigate("sales")}
          >
            <FiShoppingCart /> Savdo boshlash
          </button>
        }
      />
      <div className="metric-grid">
        <Metric
          label="Bugungi tushum"
          value={money(amountSum(todays))}
          detail={`${todays.length} ta chek`}
          icon={FiArrowUpRight}
          tone="green"
        />
        <Metric
          label="Bugungi foyda"
          value={money(todayProfit)}
          detail="Tan narx va sotuv narxi farqi"
          icon={FiTrendingUp}
          tone="green"
        />
        <Metric
          label="Haftalik tushum"
          value={money(amountSum(weekly))}
          detail="Dushanbadan bugungacha"
          icon={FiCalendar}
          tone="blue"
        />
        <Metric
          label="Haftalik foyda"
          value={money(weeklyProfit)}
          detail="Haftalik umumiy foyda"
          icon={FiTrendingUp}
          tone="blue"
        />
        <Metric
          label="Oylik tushum"
          value={money(amountSum(monthly))}
          detail={localizedMonth(month)}
          icon={FiDollarSign}
          tone="amber"
        />
        <Metric
          label="Oylik foyda"
          value={money(monthlyProfit)}
          detail="Bu oy umumiy foyda"
          icon={FiTrendingUp}
          tone="amber"
        />
        <Metric
          label="Bugungi kelgan tovar"
          value={todayIncomingSummary.value}
          detail={todayIncomingSummary.detail}
          icon={FiArrowDownLeft}
          tone="blue"
        />
        <Metric
          label="Haftalik kelgan tovar"
          value={weeklyIncomingSummary.value}
          detail={weeklyIncomingSummary.detail}
          icon={FiArrowDownLeft}
          tone="violet"
        />
        <Metric
          label="Oylik kelgan tovar"
          value={monthlyIncomingSummary.value}
          detail={monthlyIncomingSummary.detail}
          icon={FiArrowDownLeft}
          tone="amber"
        />
        <Metric
          label="Ombor qoldig‘i"
          value={stock.toLocaleString(currentLocale())}
          detail={`${data.products.length} xil tovar`}
          icon={FiBox}
          tone="violet"
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Ombor qoldiqlari</h2>
              <p>Barcha xodimlarda bir xil ko‘rinadigan jonli qoldiq</p>
            </div>
            <button
              className="text-button"
              onClick={() => onNavigate("products")}
            >
              Omborga o‘tish <FiArrowUpRight />
            </button>
          </div>
          <ProductTable products={data.products.slice(0, 6)} readOnly />
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>So‘nggi cheklar</h2>
              <p>Yaqinda rasmiylashtirilgan savdolar</p>
            </div>
            <button
              className="icon-button"
              onClick={() => onNavigate("history")}
              aria-label="Cheklar tarixini ochish"
            >
              <FiArrowUpRight />
            </button>
          </div>
          {recent.length ? (
            <div className="recent-list">
              {recent.map((sale) => (
                <div className="recent-row" key={sale.id}>
                  <span className="recent-icon">
                    <FiShoppingCart />
                  </span>
                  <div className="recent-main">
                    <strong>Chek № {sale.receiptNumber}</strong>
                    <small>
                      {sale.sellerName} · {dateTime(sale.createdAt)}
                    </small>
                  </div>
                  <b>{money(sale.total)}</b>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Hozircha savdo yo‘q"
              text="Birinchi savdoni boshlang."
            />
          )}
        </section>
      </div>
    </>
  );
}

function ProductsPage({ owner, products, onAdd, onStock, onEdit, onArchive }) {
  const [query, setQuery] = useState("");
  const filtered = products.filter((product) =>
    product.name
      .toLocaleLowerCase("uz")
      .includes(query.toLocaleLowerCase("uz")),
  );
  return (
    <>
      <PageHeading
        eyebrow="OMBOR NAZORATI"
        title={owner ? "Tovarlar va kirim" : "Ombor qoldig‘i"}
        description={
          owner
            ? "Tovar kiriting, kelgan mahsulotni qo‘shing va sotuv narxini boshqaring."
            : "Barcha xodimlar uchun umumiy ombor qoldig‘i."
        }
        action={
          owner && (
            <button className="button button-primary" onClick={onAdd}>
              <FiPlus /> Yangi tovar kirimi
            </button>
          )
        }
      />
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Mahsulotlar</h2>
            <p>{`${products.length} xil tovar`}</p>
          </div>
          <label className="search-box">
            <FiSearch />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tovar nomini qidirish"
            />
          </label>
        </div>
        <ProductTable
          products={filtered}
          owner={owner}
          onStock={onStock}
          onEdit={onEdit}
          onArchive={onArchive}
        />
      </section>
    </>
  );
}

function ProductTable({ products, owner, onStock, onEdit, onArchive, readOnly }) {
  if (!products.length)
    return (
      <Empty
        title="Tovarlar hali qo‘shilmagan"
        text={
          owner
            ? "Birinchi mahsulotni kirim qiling."
            : "Boshliq hali mahsulot kiritmagan."
        }
      />
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>TOVAR</th>
            <th>OMBORDA</th>
            <th>TAN NARX</th>
            <th>SOTUV NARXI</th>
            <th>MIN. NARX</th>
            {owner && !readOnly && <th>AMALLAR</th>}
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td>
                <div className="product-cell">
                  <span className="product-mark">
                    {product.name.trim().slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>{product.name}</strong>
                    <small>
                      {product.unit === "bag" ? "Qop hisobida"
                        : product.unit === "weight" ? "Vazn, kg hisobida"
                          : product.unit === "liter" ? "litr hisobida"
                            : product.unit === "piece" ? "dona hisobida" : "blok hisobida"}
                    </small>
                  </div>
                </div>
              </td>
              <td>
                <strong>{quantityLabel(product)}</strong>
                {product.quantity <= 0 && (
                  <span className="stock-empty">Tugagan</span>
                )}
              </td>
              <td>
                {money(product.costPrice ?? 0)}{" "}
                <small>/ {unitName(product.unit)}</small>
              </td>
              <td>
                {money(product.price)}{" "}
                <small>/ {unitName(product.unit)}</small>
              </td>
              <td>
                {money(product.minimumPrice)} <small>dan kam emas</small>
              </td>
              {owner && !readOnly && (
                <td>
                  <div className="table-actions">
                    <button
                      className="button button-tertiary button-small"
                      onClick={() => onStock(product)}
                    >
                      <FiPlus /> Kirim qo‘shish
                    </button>
                    <button
                      className="button button-tertiary button-small"
                      onClick={() => onEdit(product)}
                    >
                      Narxni tahrirlash
                    </button>
                    <button
                      className="button button-danger button-small"
                      onClick={() => onArchive(product)}
                    >
                      <FiTrash2 /> Olib tashlash
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SalesPage({ user, companyName, products, employees, onSale }) {
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState([]);
  const [sellerId, setSellerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receiptAutoPrint, setReceiptAutoPrint] = useState(false);
  const owner = user.role === "company_owner";
  const available = products.filter(
    (item) =>
      item.quantity > 0 &&
      item.name.toLocaleLowerCase("uz").includes(query.toLocaleLowerCase("uz")),
  );
  const getLineTotal = (item) => Math.round(item.price * item.quantity);
  const total = cart.reduce((sum, item) => sum + getLineTotal(item), 0);

  function add(product) {
    setCart((current) => {
      const found = current.find((item) => item.productId === product.id);
      return found
        ? current.map((item) =>
            item.productId === product.id
              ? {
                  ...item,
                  quantity: Math.min(
                    item.quantity + (product.unit === "weight" ? 0 : 1),
                    product.quantity,
                  ),
                }
              : item,
          )
        : [
            ...current,
            {
              productId: product.id,
              name: product.name,
              unit: product.unit,
              quantity:
                product.unit === "liter" && product.volumeUnit === "ml"
                  ? 0.001
                  : 1,
              volumeInputUnit:
                product.unit === "liter" ? product.volumeUnit || "l" : undefined,
              amount: product.unit === "weight" ? product.price : undefined,
              quantityInput: product.unit === "weight" ? "1" : undefined,
              inputMode: product.unit === "weight" ? "amount" : "quantity",
              price: product.price,
              maximum: product.price,
              minimum: product.minimumPrice,
              stock: product.quantity,
            },
          ];
    });
  }
  function update(productId, key, value) {
    setCart((current) =>
      current.map((item) => {
        if (item.productId !== productId) return item;
        if (item.unit !== "weight") {
          if (key === "quantity") {
            const quantity = Number(String(value).trim().replace(",", "."));
            const validQuantity = Number.isFinite(quantity);
            return {
              ...item,
              quantity: validQuantity
                ? quantity *
                  (item.unit === "liter"
                    ? volumeFactor(item.volumeInputUnit)
                    : 1)
                : 0,
              quantityInput: String(value),
            };
          }
          if (key === "volumeInputUnit" && item.unit === "liter") {
            const factor = volumeFactor(value);
            return {
              ...item,
              volumeInputUnit: value,
              quantityInput: String(Number((item.quantity / factor).toFixed(6))),
            };
          }
          return { ...item, [key]: value };
        }
        if (key !== "amount" && key !== "quantity" && key !== "price")
          return { ...item, [key]: value };
        if (key === "amount") {
          const amount = value === "" ? "" : Number(value);
          const quantity =
            amount === "" || item.price <= 0 ? 0 : amount / item.price;
          return {
            ...item,
            amount,
            quantity,
            quantityInput:
              quantity > 0 ? String(Number(quantity.toFixed(6))) : "",
            inputMode: "amount",
          };
        }
        if (key === "quantity") {
          const normalized = String(value).trim().replace(",", ".");
          const quantity = normalized === "" ? 0 : Number(normalized);
          const validQuantity = Number.isFinite(quantity);
          return {
            ...item,
            quantity: validQuantity ? quantity : 0,
            quantityInput: String(value),
            amount:
              validQuantity && quantity > 0
                ? Math.round(quantity * item.price)
                : "",
            inputMode: "quantity",
          };
        }
        const price = Number(value);
        const quantity = Number(item.quantity) || 0;
        const amount =
          item.inputMode === "quantity"
            ? Math.round(quantity * price)
            : Number(item.amount) || 0;
        return {
          ...item,
          price,
          amount,
          quantity:
            item.inputMode === "quantity"
              ? quantity
              : price > 0
                ? amount / price
                : 0,
          quantityInput:
            item.inputMode === "quantity"
              ? item.quantityInput
              : price > 0
                ? String(Number((amount / price).toFixed(6)))
                : "",
        };
      }),
    );
  }
  function checkout() {
    if (canCheckout) setCheckoutOpen(true);
  }
  async function confirmCheckout() {
    if (
      !cart.length ||
      cart.some(
        (item) =>
          !Number.isFinite(item.quantity) ||
          item.quantity <= 0 ||
          item.quantity > item.stock ||
          (item.unit === "weight" &&
            (!Number.isSafeInteger(item.amount) ||
              item.amount <= 0 ||
              item.amount > item.stock * item.price)) ||
          (["bag", "piece", "block"].includes(item.unit) && !Number.isSafeInteger(item.quantity)) ||
          item.price < item.minimum ||
          item.price > item.maximum,
      )
    )
      return;
    setSaving(true);
    try {
      const payload = {
        items: cart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
          quantityUnit: item.volumeInputUnit,
        })),
      };
      if (owner && sellerId) payload.sellerId = sellerId;
      const savedSale = await onSale(payload);
      setReceiptAutoPrint(true);
      setReceipt(savedSale);
      setCheckoutOpen(false);
      setCart([]);
      setSellerId("");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  const canCheckout =
    cart.length > 0 &&
    cart.every(
      (item) =>
        item.quantity > 0 &&
        item.quantity <= item.stock &&
        (item.unit !== "weight" ||
          (Number.isSafeInteger(item.amount) &&
            item.amount > 0 &&
            item.amount <= item.stock * item.price)) &&
        item.price >= item.minimum &&
        item.price <= item.maximum &&
        (!["bag", "piece", "block"].includes(item.unit) || Number.isSafeInteger(item.quantity)),
    );
  return (
    <>
      <PageHeading
        eyebrow="SAVDO KASSASI"
        title="Yangi savdo"
        description="Tovar tanlang; vaznli mahsulotlarda summa yoki kg kiriting, qolgan qiymat avtomatik hisoblanadi."
      />
      <div className="sales-layout">
        <section className="panel catalog-panel">
          <label className="search-box search-large">
            <FiSearch />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tovar nomini qidiring..."
            />
          </label>
          <div className="catalog-meta">
            <span>SOTUV UCHUN MAVJUD</span>
            <span>{available.length} ta</span>
          </div>
          <div className="catalog-list">
            {available.length ? (
              available.map((product) => (
                <button
                  className="catalog-item"
                  key={product.id}
                  onClick={() => add(product)}
                >
                  <span className="product-mark">
                    {product.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="catalog-info">
                    <strong>{product.name}</strong>
                    <small>{quantityLabel(product)} mavjud</small>
                  </span>
                  <span className="catalog-price">
                    <strong>{money(product.price)}</strong>
                    <small>/{unitName(product.unit)}</small>
                  </span>
                  <span className="catalog-add">
                    <FiPlus />
                  </span>
                </button>
              ))
            ) : (
              <Empty
                title={query ? "Tovar topilmadi" : "Sotishga tovar yo‘q"}
                text={
                  query
                    ? "Boshqa so‘z bilan qidiring."
                    : "Omborga kirim qilgach mahsulotlar ko‘rinadi."
                }
              />
            )}
          </div>
        </section>
        <section className="panel cart-panel">
          <div className="panel-head">
            <div>
              <h2>Savdo savati</h2>
              <p>{cart.length} ta mahsulot</p>
            </div>
            <span className="cart-symbol">
              <FiShoppingCart />
            </span>
          </div>
          {owner && (
            <Field label="Sotuvni rasmiylashtirayotgan hodim">
              <select
                value={sellerId}
                onChange={(event) => setSellerId(event.target.value)}
              >
                <option value="">Boshliq</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {cart.length ? (
            <div className="cart-items">
              {cart.map((item) => (
                <div className="cart-row" key={item.productId}>
                  <div className="cart-product">
                    <strong>{item.name}</strong>
                    <small>
                      {item.unit === "weight"
                        ? `Asosiy narx: ${money(item.price)} / kg`
                        : `Ruxsat etilgan narx: ${money(item.minimum)} – ${money(item.maximum)} / ${unitName(item.unit)}`}
                    </small>
                  </div>
                  <div className="cart-inputs">
                    {item.unit !== "weight" ? (
                      <label>
                        <span>
                          {unitName(
                            item.unit === "liter"
                              ? item.volumeInputUnit
                              : item.unit,
                          )}
                        </span>
                        <input
                          type="text"
                          inputMode={["bag", "piece", "block"].includes(item.unit) ? "numeric" : "decimal"}
                          min={item.unit === "liter" ? 0.001 : 1}
                          step={
                            ["bag", "piece", "block"].includes(item.unit)
                              ? 1
                              : item.unit === "liter" &&
                                  item.volumeInputUnit === "ml"
                                ? 1
                                : 0.001
                          }
                          max={
                            item.unit === "liter"
                              ? item.stock / volumeFactor(item.volumeInputUnit)
                              : item.stock
                          }
                          value={
                            item.unit === "liter"
                              ? item.quantity / volumeFactor(item.volumeInputUnit)
                              : item.quantity
                          }
                          onChange={(event) =>
                            update(
                              item.productId,
                              "quantity",
                              event.target.value,
                            )
                          }
                        />
                        {item.unit === "liter" && (
                          <select
                            aria-label={`${item.name} miqdor birligi`}
                            value={item.volumeInputUnit}
                            onChange={(event) =>
                              update(
                                item.productId,
                                "volumeInputUnit",
                                event.target.value,
                              )
                            }
                          >
                            <option value="l">litr</option>
                            <option value="ml">millilitr</option>
                          </select>
                        )}
                      </label>
                    ) : (
                      <>
                        <label>
                          <span>
                            Olinadigan summa (so‘m)
                            {item.inputMode !== "amount" && " · hisoblanadi"}
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            aria-label={`${item.name} uchun olinadigan summa`}
                            readOnly={item.inputMode !== "amount"}
                            value={
                              item.amount === ""
                                ? ""
                                : numberInput(item.amount).replace(
                                    /[\u00a0\u202f]/g,
                                    " ",
                                  )
                            }
                            onFocus={() =>
                              update(item.productId, "inputMode", "amount")
                            }
                            onChange={(event) =>
                              update(
                                item.productId,
                                "amount",
                                event.target.value.trim() === ""
                                  ? ""
                                  : readNumber(event.target.value),
                              )
                            }
                          />
                        </label>
                        <label>
                          <span>
                            Miqdor (kg)
                            {item.inputMode !== "quantity" && " · hisoblanadi"}
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            aria-label={`${item.name} miqdori kilogrammda`}
                            readOnly={item.inputMode !== "quantity"}
                            value={item.quantityInput ?? ""}
                            onFocus={() =>
                              update(item.productId, "inputMode", "quantity")
                            }
                            onChange={(event) =>
                              update(
                                item.productId,
                                "quantity",
                                event.target.value,
                              )
                            }
                          />
                        </label>
                      </>
                    )}
                    {item.unit !== "weight" && (
                      <label>
                        <span>Narxi / {unitName(item.unit)}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={numberInput(item.price)}
                          onChange={(event) =>
                            update(
                              item.productId,
                              "price",
                              readNumber(event.target.value),
                            )
                          }
                        />
                      </label>
                    )}
                  </div>
                  <div className="cart-line-total">
                    <small className="line-calculation">
                      {saleQuantityLabel(item, item.quantity)} × {money(item.price)} ={" "}
                    </small>
                    {money(getLineTotal(item))}
                    <small>so‘m</small>
                  </div>
                  <button
                    className="icon-button"
                    onClick={() =>
                      setCart((current) =>
                        current.filter(
                          (entry) => entry.productId !== item.productId,
                        ),
                      )
                    }
                    aria-label={`${item.name}ni olib tashlash`}
                  >
                    <FiX />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="Savat bo‘sh" text="Chap tomondan tovar tanlang." />
          )}
          <div className="cart-footer">
            <div className="total-line">
              <span>Jami</span>
              <strong>{money(total)}</strong>
            </div>
            <button
              className="button button-primary button-wide"
              disabled={!canCheckout || saving}
              onClick={checkout}
            >
              Savdoni yakunlash <FiChevronRight />
            </button>
            <small>
              Yakunlashda narx va ombor qoldig‘i serverda tekshiriladi.
            </small>
          </div>
        </section>
      </div>
      {checkoutOpen && (
        <Modal
          className="checkout-confirm-modal"
          title="Savdoni tasdiqlash"
          subtitle="Chekni chop etish savdoni saqlaydi va ombor qoldig‘ini yangilaydi."
          onClose={() => setCheckoutOpen(false)}
        >
          <div className="checkout-confirm-summary">
            {cart.map((item) => (
              <div className="checkout-confirm-row" key={item.productId}>
                <span>{item.name} · {saleQuantityLabel(item, item.quantity)}</span>
                <strong>{money(getLineTotal(item))}</strong>
              </div>
            ))}
            <div className="checkout-confirm-total">
              <span>Jami</span><strong>{money(total)}</strong>
            </div>
          </div>
          <div className="checkout-confirm-actions">
            <button
              className="button button-secondary"
              type="button"
              disabled={saving}
              onClick={() => {
                setCheckoutOpen(false);
                setCart([]);
                setSellerId("");
              }}
            >
              <FiX /> Savdoni rad etish
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={saving}
              onClick={confirmCheckout}
            >
              {saving ? "Saqlanmoqda..." : <><FiPrinter /> Chekni chop etish</>}
            </button>
          </div>
        </Modal>
      )}
      {receipt && (
        <Modal
          className="receipt-modal"
          backdropClassName="receipt-backdrop"
          title={`Chek № ${receipt.receiptNumber}`}
          subtitle={`Sana: ${dateTime(receipt.createdAt)} · Sotuvchi: ${receipt.sellerName}`}
          onClose={() => {
            setReceipt(null);
            setReceiptAutoPrint(false);
          }}
        >
          <Receipt sale={{ ...receipt, companyName }} autoPrint={receiptAutoPrint} />
        </Modal>
      )}
    </>
  );
}

function Receipt({ sale, autoPrint = false }) {
  const [qrResult, setQrResult] = useState(null);

  useEffect(() => {
    let active = true;
    const receiptDetails = {
      type: "Yemzor receipt",
      id: sale.id,
      brand: sale.companyName || "Yemzor",
      number: sale.receiptNumber,
      date: sale.createdAt,
      seller: sale.sellerName,
      total: sale.total,
      items: sale.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        quantityUnit: item.quantityUnit,
        price: item.price,
        costPrice: item.costPrice ?? item.price,
        profit: item.profit ?? Math.max(0, (Number(item.lineTotal) || 0) - (Number(item.cost) || 0)),
        total: item.lineTotal,
      })),
    };

    QRCode.toDataURL(JSON.stringify(receiptDetails), {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 216,
      color: {
        dark: "#183d2b",
        light: "#ffffff",
      },
    })
      .then((dataUrl) => {
        if (active) setQrResult({ saleId: sale.id, dataUrl });
      })
      .catch(() => {
        if (active) setQrResult({ saleId: sale.id, error: true });
      });

    return () => {
      active = false;
    };
  }, [sale]);
  useEffect(() => {
    if (!autoPrint) return undefined;
    const timer = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(timer);
  }, [autoPrint, sale.id]);

  const currentQr = qrResult?.saleId === sale.id ? qrResult : null;
  const totalProfit = (sale.items || []).reduce((sum, item) => sum + (Number(item.profit) || Math.max(0, (Number(item.lineTotal) || 0) - (Number(item.cost) || 0))), 0);

  return (
    <div className="receipt">
      <div className="receipt-brand">
        <img className="brand-symbol" src="/yemzor-logo.png" alt="" />
        <strong>{sale.companyName || "Yemzor"}</strong>
      </div>
      <p className="receipt-number">CHEK № {sale.receiptNumber}</p>
      <p className="receipt-date">{receiptDateTime(sale.createdAt)}</p>
      <div className="receipt-lines">
        {sale.items.map((item, index) => (
          <div className="receipt-line" key={`${item.productId}-${index}`}>
            <span>
              {item.name}
              <small>
                {saleQuantityLabel(item, item.quantity)} × {money(item.price)} / {unitName(item.unit)}
                {item.costPrice != null && ` · Tan narx: ${money(item.costPrice)}`}
                {Number(item.profit || 0) !== 0 && ` · Foyda: ${money(item.profit)}`}
              </small>
            </span>
            <b>{money(item.lineTotal)}</b>
          </div>
        ))}
      </div>
      <div className="total-line">
        <span>Jami</span>
        <strong>{money(sale.total)}</strong>
      </div>
      {totalProfit !== 0 && (
        <div className="total-line total-line-profit">
          <span>Umumiy foyda</span>
          <strong>{money(totalProfit)}</strong>
        </div>
      )}
      <div className="receipt-qr">
        <div className="receipt-qr-frame">
          {currentQr?.dataUrl ? (
            <img
              src={currentQr.dataUrl}
              alt={`Chek № ${sale.receiptNumber} ma’lumotlari uchun QR kod`}
            />
          ) : currentQr?.error ? (
            <span className="receipt-qr-error" role="alert">
              QR kodni yaratib bo‘lmadi.
            </span>
          ) : (
            <span
              className="receipt-qr-loading"
              aria-label="QR kod tayyorlanmoqda"
            />
          )}
        </div>
        <div className="receipt-qr-copy">
          <strong>Chek ma’lumotlari</strong>
          <span>QR kod cashback bermaydi — faqat chek ma’lumotlari uchun.</span>
        </div>
      </div>
      <button
        className="button button-secondary button-wide no-print"
        disabled={!currentQr?.dataUrl}
        onClick={() => window.print()}
      >
        <FiPrinter />{" "}
        {currentQr?.error
          ? "QR kod xatosi"
          : currentQr?.dataUrl
            ? "Chekni chop etish"
            : "QR kod tayyorlanmoqda..."}
      </button>
    </div>
  );
}

function HistoryPage({
  sales,
  receipts,
  products,
  companyName,
  owner,
  employees,
}) {
  const now = useClock();
  const [period, setPeriod] = useState("month");
  const [selectedDate, setSelectedDate] = useState(() => dayKey(now));
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(now));
  const [lookup, setLookup] = useState("");
  const monthChoices = [...new Set([
    monthKey(now),
    ...sales.map((sale) => monthKey(new Date(sale.createdAt))),
    ...receipts.map((entry) => monthKey(new Date(entry.createdAt))),
  ])].sort((a, b) => b.localeCompare(a));
  const monthsByYear = monthChoices.reduce((groups, month) => {
    const year = month.slice(0, 4);
    groups[year] ||= [];
    groups[year].push(month);
    return groups;
  }, {});
  const filteredSales = sales.filter((sale) => {
    const date = new Date(sale.createdAt);
    if (period === "today") return dayKey(date) === dayKey(now);
    if (period === "week") return date >= startOfWeek(now);
    if (period === "month") return monthKey(date) === selectedMonth;
    if (period === "date") return dayKey(date) === selectedDate;
    return true;
  });
  const receipt = sales.find(
    (sale) =>
      monthKey(new Date(sale.createdAt)) === selectedMonth &&
      sale.receiptNumber === lookup.trim().replace(/\D/g, "").padStart(6, "0"),
  );
  const monthlyReceipts = receipts.filter(
    (entry) => monthKey(new Date(entry.createdAt)) === selectedMonth,
  );
  const monthlySales = sales.filter(
    (entry) => monthKey(new Date(entry.createdAt)) === selectedMonth,
  );
  const periodReceipts = receipts.filter((entry) => {
    const date = new Date(entry.createdAt);
    if (period === "today") return dayKey(date) === dayKey(now);
    if (period === "week") return date >= startOfWeek(now);
    if (period === "month") return monthKey(date) === selectedMonth;
    if (period === "date") return dayKey(date) === selectedDate;
    return true;
  });
  const report = new Map();
  for (const item of monthlyReceipts) {
    const key = item.productId;
    const row = report.get(key) || {
      id: key,
      name: item.name,
      unit: item.unit,
      incoming: 0,
      incomingValue: 0,
      sold: 0,
      soldValue: 0,
      costValue: 0,
      profit: 0,
    };
    row.incoming += item.quantity;
    row.incomingValue += item.total;
    report.set(key, row);
  }
  for (const sale of monthlySales)
    for (const line of sale.items) {
      const key = line.productId;
      const row = report.get(key) || {
        id: key,
        name: line.name,
        unit: line.unit,
        incoming: 0,
        incomingValue: 0,
        sold: 0,
        soldValue: 0,
        costValue: 0,
        profit: 0,
      };
      row.sold += line.quantity;
      row.soldValue += line.lineTotal;
      row.costValue += Number(line.cost) || 0;
      row.profit += Number(line.profit) || Math.max(0, (Number(line.lineTotal) || 0) - (Number(line.cost) || 0));
      report.set(key, row);
    }
  const reportRows = [...report.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "uz"),
  );
  const periods = [
    ["today", "Bugun"],
    ["week", "Hafta"],
    ["month", "Oy"],
    ["date", "Sana"],
    ["all", "Hammasi"],
  ];
  return (
    <>
      <PageHeading
        eyebrow="SAVDO VA KIRIM HISOBOTI"
        title="Cheklar va hisobot"
        description="Chek raqamini tekshiring, tushum va oylik tovar harakatini ko‘ring."
      />
      <section className="panel report-panel">
        <div className="month-navigation" aria-label="Oy bo‘yicha tanlash">
          <div className="month-navigation-heading">
            <h2>Oy bo‘yicha tarix</h2>
            <strong>{localizedMonth(selectedMonth)}</strong>
          </div>
          {Object.entries(monthsByYear).map(([year, months]) => (
            <section className="month-year-group" key={year} aria-label={year}>
              <h3>{year}</h3>
              <div className="month-choice-grid">
                {months.map((month) => (
                  <button
                    className={`month-choice ${selectedMonth === month ? "selected" : ""}`}
                    key={month}
                    aria-pressed={selectedMonth === month}
                    onClick={() => {
                      setSelectedMonth(month);
                      setPeriod("month");
                    }}
                  >
                    {new Intl.DateTimeFormat(currentLocale(), { month: "long" })
                      .format(new Date(`${month}-01T00:00:00`))}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="lookup-row">
          <div>
            <h2>Chekni tekshirish</h2>
            <p>Chek raqami orqali sotilgan mahsulot va narxini toping.</p>
          </div>
          <label className="search-box">
            <FiSearch />
            <input
              inputMode="numeric"
              value={lookup}
              onChange={(event) => setLookup(event.target.value)}
              placeholder="Masalan, 000123"
            />
          </label>
        </div>
        {lookup &&
          (receipt ? (
            <Receipt sale={{ ...receipt, companyName }} />
          ) : (
            <p className="not-found">
              Bu do‘konda ushbu chek raqami topilmadi.
            </p>
          ))}
        <div className="report-toolbar">
          <div className="segmented">
            {periods.map(([value, label]) => (
              <button
                key={value}
                className={period === value ? "selected" : ""}
                onClick={() => setPeriod(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {period === "date" && (
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          )}
        </div>
        <div className="report-summary">
          <Metric
            label="Tanlangan davr tushumi"
            value={money(amountSum(filteredSales))}
            detail={`${filteredSales.length} ta chek`}
            icon={FiDollarSign}
            tone="green"
          />
          <Metric
            label="Tanlangan davr foydasi"
            value={money(filteredSales.reduce((sum, sale) => sum + (Number(sale.profit) || 0), 0))}
            detail="Tan narxdan foyda"
            icon={FiTrendingUp}
            tone="green"
          />
          <Metric
            label="Tanlangan davr kirimi"
            value={movementQuantity(periodReceipts)}
            detail={money(amountSum(periodReceipts))}
            icon={FiArrowDownLeft}
            tone="blue"
          />
          <Metric
            label="Mahsulot turlari"
            value={products.length}
            detail="Ombordagi jami"
            icon={FiBox}
            tone="violet"
          />
        </div>
        <div className="panel-head report-title">
          <div>
            <h2>Oylik kelim va sotuv</h2>
            <p>
              Har bir tovar bo‘yicha kelgan va sotilgan miqdor hamda qiymati
            </p>
          </div>
          <strong>{localizedMonth(selectedMonth)}</strong>
        </div>
        {reportRows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>TOVAR</th>
                  <th>KELDI</th>
                  <th>TAN NARX</th>
                  <th>SOTILDI</th>
                  <th>SOTUV TUSHUMI</th>
                  <th>FOYDA</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.map((row) => {
                  const purchaseCost = monthlySales.reduce((sum, sale) => sum + (sale.items || []).filter((item) => item.productId === row.id).reduce((lineTotal, item) => lineTotal + (Number(item.cost) || 0), 0), 0);
                  const revenue = monthlySales.reduce((sum, sale) => sum + (sale.items || []).filter((item) => item.productId === row.id).reduce((lineTotal, item) => lineTotal + (Number(item.lineTotal) || 0), 0), 0);
                  const profit = Number(row.profit) || revenue - purchaseCost;
                  return (
                    <tr key={row.id || row.name}>
                      <td>{row.name}</td>
                      <td>
                        {formatQuantity(row.incoming, row.unit)}{" "}
                        {unitName(row.unit)}
                      </td>
                      <td>{money(row.incomingValue)}</td>
                      <td>
                        {formatQuantity(row.sold, row.unit)}{" "}
                        {unitName(row.unit)}
                      </td>
                      <td>{money(row.soldValue)}</td>
                      <td>{money(profit)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Bu oyda harakat yo‘q"
            text="Tanlangan oydagi kirim va savdolar shu yerda jamlanadi."
          />
        )}
        <div className="panel-head report-title">
          <div>
            <h2>Mahsulot kirimlari tarixi</h2>
            <p>{`${periodReceipts.length} ta kirim · tanlangan davr va kelgan sanasi bo‘yicha`}</p>
          </div>
        </div>
        {periodReceipts.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>KELGAN SANA</th>
                  <th>TOVAR</th>
                  <th>MIQDOR</th>
                  <th>BIRLIK NARXI</th>
                  <th>JAMI</th>
                </tr>
              </thead>
              <tbody>
                {[...periodReceipts]
                  .sort((first, second) =>
                    second.createdAt.localeCompare(first.createdAt),
                  )
                  .map((entry) => (
                    <tr key={entry.id}>
                      <td>{dateTime(entry.createdAt)}</td>
                      <td>
                        <strong>{entry.name}</strong>
                      </td>
                      <td>
                        {saleQuantityLabel(entry, entry.quantity)}
                      </td>
                      <td>{money(entry.price)}</td>
                      <td>
                        <strong>{money(entry.total)}</strong>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Tanlangan davrda kirim yo‘q"
            text="Tovar qo‘shilganda kirim summasi va sanasi shu yerda saqlanadi."
          />
        )}
        <div className="panel-head report-title">
          <div>
            <h2>Savdo cheklari</h2>
            <p>{`${filteredSales.length} ta savdo · sotuvchi va vaqt bo‘yicha`}</p>
          </div>
        </div>
        {filteredSales.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>CHEK</th>
                  <th>SOTUVCHI</th>
                  <th>TOVARLAR</th>
                  <th>SANA</th>
                  <th>JAMI</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((sale) => (
                  <tr key={sale.id}>
                    <td>
                      <strong>№ {sale.receiptNumber}</strong>
                    </td>
                    <td>{sale.sellerName}</td>
                    <td>
                      {sale.items
                        .map(
                          (item) =>
                            `${item.name} × ${saleQuantityLabel(item, item.quantity)}`,
                        )
                        .join(", ")}
                    </td>
                    <td>{dateTime(sale.createdAt)}</td>
                    <td>
                      <strong>{money(sale.total)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Cheklar topilmadi"
            text="Tanlangan davrda savdo yo‘q."
          />
        )}
        {owner && employees.length > 0 && (
          <div className="seller-totals">
            <strong>Tanlangan davr sotuvchilari</strong>
            {employees.map((employee) => (
              <span key={employee.id}>
                {employee.name}:{" "}
                {money(
                  amountSum(
                    filteredSales.filter(
                      (sale) => sale.sellerId === employee.id,
                    ),
                  ),
                )}
              </span>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function StaffPage({
  employees,
  managers = [],
  movements,
  attendance,
  sales,
  month,
  absentDeduction,
  restDayWorkBonusEnabled = false,
  restDayWorkBonusAmount = 0,
  abedPaymentsEnabled = true,
  canManageAttendance = false,
  canManagePayroll = false,
  canManageEmployees = true,
  canManageManagers = false,
  onAdd,
  onAddManager,
  onMovement,
  onEdit,
  onRemove,
  onEditManager,
  onRemoveManager,
  onAttendance,
}) {
  const now = useClock();
  const [attendanceDate, setAttendanceDate] = useState(() => dayKey(now));
  const [excusedTarget, setExcusedTarget] = useState(null);
  const payroll = (employee) => {
    const startDate = employee.startDate || employee.createdAt?.slice(0, 10);
    const advances = movements
      .filter(
        (item) =>
          item.employeeId === employee.id &&
          item.period === month &&
          item.kind === "advance",
      )
      .reduce((sum, item) => sum + item.amount, 0);
    const abed = abedPaymentsEnabled ? movements
      .filter(
        (item) =>
          item.employeeId === employee.id &&
          item.period === month &&
          item.kind === "abed",
      )
      .reduce((sum, item) => sum + item.amount, 0) : 0;
    const abedTotal = abedPaymentsEnabled ? movements
      .filter((item) => item.employeeId === employee.id && item.kind === "abed")
      .reduce((sum, item) => sum + item.amount, 0) : 0;
    const absentDays = attendance.filter(
      (item) =>
        item.employeeId === employee.id &&
        item.status === "absent" &&
        item.date.slice(0, 7) === month &&
        (!startDate || item.date >= startDate) &&
        !isRestDay(
          {
            restDay: Number.isInteger(item.restDay)
              ? item.restDay
              : employee.restDay,
          },
          item.date,
        ),
    ).length;
    const absentPenalty = absentDays * absentDeduction;
    const restDayWorkDays = attendance.filter(
      (item) =>
        item.employeeId === employee.id &&
        item.status === "present" &&
        item.date.slice(0, 7) === month &&
        (!startDate || item.date >= startDate) &&
        isRestDay(
          { restDay: Number.isInteger(item.restDay) ? item.restDay : employee.restDay },
          item.date,
        ),
    ).length;
    const restDayBonus = restDayWorkBonusEnabled
      ? restDayWorkDays * restDayWorkBonusAmount
      : 0;
    return {
      advances,
      abed,
      abedTotal,
      absentDays,
      absentPenalty,
      restDayWorkDays,
      restDayBonus,
      remaining: Math.max(employee.monthlySalary + restDayBonus - advances - absentPenalty, 0),
    };
  };
  return (
    <>
      {excusedTarget && (
        <Modal
          className="attendance-reason-modal"
          title={`${excusedTarget.employee.name}: sababli kelmadi`}
          subtitle={`Davomat sanasi: ${excusedTarget.date}`}
          onClose={() => setExcusedTarget(null)}
        >
          <AccessForm
            submitLabel="Sababli deb saqlash"
            onSubmit={async (form) => {
              await onAttendance(
                excusedTarget.employee,
                "excused",
                excusedTarget.date,
                form.get("reason"),
              );
              setExcusedTarget(null);
            }}
          >
            <Field label="Kelmagan sababi">
              <textarea
                name="reason"
                required
                minLength="3"
                maxLength="300"
                rows="4"
                defaultValue={excusedTarget.reason}
                placeholder="Masalan: oilaviy sabab yoki kasallik"
              />
            </Field>
          </AccessForm>
        </Modal>
      )}
      <PageHeading
        eyebrow="JAMOA VA OYLIK"
        title={canManageEmployees ? "Hodimlar" : "Jamoa"}
        description={
          canManageEmployees
            ? "Har bir xodimning loginini, oyligini, avansini va Abed pulini alohida kuzating."
            : "Menejer sifatida xodimlar va oylik ko‘rsatkichlari bilan ishlaysiz."
        }
        action={
          canManageEmployees && (
            <button className="button button-primary" onClick={onAdd}>
              <FiPlus /> Hodim qo‘shish
            </button>
          )
        }
      />
      {canManageManagers && managers.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Menejerlar</h2>
              <p>Do‘konga kirish huquqi berilgan menejerlar ro‘yxati</p>
            </div>
            {canManageManagers && (
              <button
                className="button button-secondary button-small"
                onClick={onAddManager}
              >
                <FiPlus /> Menejer qo‘shish
              </button>
            )}
          </div>
          <div className="staff-grid">
            {managers.map((manager) => (
              <article className="staff-card" key={manager.id}>
                <div className="staff-card-head">
                  <span className="avatar avatar-blue">
                    {manager.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <h3>{manager.name}</h3>
                    <span>@{manager.login}</span>
                  </div>
                  {canManageManagers && (
                    <>
                      <button
                        className="text-button"
                        onClick={() => onEditManager(manager)}
                      >
                        Tahrirlash
                      </button>
                      <button
                        className="button button-danger button-small"
                        onClick={() => onRemoveManager(manager)}
                      >
                        <FiTrash2 /> O‘chirish
                      </button>
                    </>
                  )}
                </div>
                <div className="staff-stats">
                  <div>
                    <small>Oylik</small>
                    <strong>{money(manager.monthlySalary || 0)}</strong>
                  </div>
                  <div>
                    <small>Roli</small>
                    <strong>Menejer</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {canManageManagers && managers.length === 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Menejerlar</h2>
              <p>Menejerlar mavjud emas</p>
            </div>
            <button
              className="button button-secondary button-small"
              onClick={onAddManager}
            >
              <FiPlus /> Menejer qo‘shish
            </button>
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Jamoa</h2>
            <p>Oylik hisob davri: {localizedMonth(month)}{restDayWorkBonusEnabled ? ` · Dam olish kuni bonusi: ${money(restDayWorkBonusAmount)} / kun` : ""}</p>
          </div>
          <label className="attendance-date">
            Davomat sanasi
            <input
              type="date"
              value={attendanceDate}
              max={dayKey(now)}
              onChange={(event) => {
                if (event.target.value <= dayKey(now)) {
                  setAttendanceDate(event.target.value);
                }
              }}
            />
          </label>
          <span className="count-pill">
            {employeeCountLabel(employees.length)}
          </span>
        </div>
        {employees.length ? (
          <div className="staff-grid">
            {employees.map((employee) => {
              const values = payroll(employee);
              const employeeSales = sales.filter(
                (sale) =>
                  sale.sellerId === employee.id &&
                  monthKey(new Date(sale.createdAt)) === month,
              );
              const attendanceRecord = attendance.find(
                (item) =>
                  item.employeeId === employee.id &&
                  item.date === attendanceDate,
              );
              const startDate =
                employee.startDate || employee.createdAt?.slice(0, 10);
              const notStarted = Boolean(
                startDate && attendanceDate < startDate,
              );
              const restDay =
                !notStarted && isRestDay(employee, attendanceDate);
              const todayStatus = notStarted ? null : attendanceRecord?.status;
              return (
                <article className="staff-card" key={employee.id}>
                  <div className="staff-card-head">
                    <span className="avatar avatar-green">
                      {employee.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <h3>{employee.name}</h3>
                      <span>@{employee.login}</span>
                      <span>Ish boshlagan: {startDate || "—"}</span>
                    </div>
                    {canManageEmployees && (
                      <>
                        <button
                          className="text-button"
                          onClick={() => onEdit(employee)}
                        >
                          Tahrirlash
                        </button>
                        <button
                          className="button button-danger button-small"
                          onClick={() => onRemove(employee)}
                        >
                          <FiTrash2 /> Chiqarish
                        </button>
                      </>
                    )}
                  </div>
                  <div className="attendance-control">
                    <span
                      className={`attendance-status ${notStarted ? "unmarked" : restDay ? "rest-day" : todayStatus || "unmarked"}`}
                    >
                      {notStarted
                        ? "Hali ish boshlamagan"
                        : restDay
                          ? todayStatus === "present"
                            ? `Dam olish · Keldi${restDayWorkBonusEnabled ? ` · bonus ${money(restDayWorkBonusAmount)}` : ""}`
                            : `Dam olish · ${weekdayName(employee.restDay)}`
                          : todayStatus === "present"
                            ? "Keldi"
                            : todayStatus === "absent"
                              ? "Kelmadi"
                              : todayStatus === "excused"
                                ? "Sababli"
                                : "Qayd etilmagan"}
                    </span>
                    {!notStarted &&
                      canManageAttendance &&
                      (restDay ? (
                        todayStatus !== "present" && (
                          <button
                            className="button button-small button-secondary"
                            aria-label={`${employee.name}: dam olish kunida keldi deb belgilash`}
                            onClick={() =>
                              onAttendance(
                                employee,
                                "present",
                                attendanceDate,
                              ).catch((error) => toast.error(error.message))
                            }
                          >
                            Keldi
                          </button>
                        )
                      ) : (
                        <>
                          <button
                            className={`button button-small ${todayStatus === "present" ? "button-primary" : "button-secondary"}`}
                            aria-label={`${employee.name}: keldi deb belgilash`}
                            onClick={() =>
                              onAttendance(
                                employee,
                                "present",
                                attendanceDate,
                              ).catch((error) => toast.error(error.message))
                            }
                          >
                            Keldi
                          </button>
                          <button
                            className={`button button-small ${todayStatus === "absent" ? "button-danger" : "button-secondary"}`}
                            aria-label={`${employee.name}: kelmadi deb belgilash`}
                            onClick={() =>
                              onAttendance(
                                employee,
                                "absent",
                                attendanceDate,
                              ).catch((error) => toast.error(error.message))
                            }
                          >
                            Kelmadi
                          </button>
                          <button
                            className={`button button-small ${todayStatus === "excused" ? "button-primary" : "button-secondary"}`}
                            aria-label={`${employee.name}: sababli kelmadi deb belgilash`}
                            onClick={() =>
                              setExcusedTarget({
                                employee,
                                date: attendanceDate,
                                reason:
                                  attendanceRecord?.status === "excused"
                                    ? attendanceRecord.reason || ""
                                    : "",
                              })
                            }
                          >
                            Sababli
                          </button>
                        </>
                      ))}
                    {attendanceRecord?.status === "excused" &&
                      attendanceRecord.reason && (
                        <p className="attendance-reason">
                          <strong>Sababi:</strong> {attendanceRecord.reason}
                        </p>
                      )}
                  </div>
                  <div className="staff-stats">
                    <div>
                      <small>Oylik</small>
                      <strong>{money(employee.monthlySalary)}</strong>
                    </div>
                    <div>
                      <small>Avans</small>
                      <strong className="text-danger">
                        {money(values.advances)}
                      </strong>
                    </div>
                    <div>
                      <small>Jarima</small>
                      <strong className="text-danger">
                        {money(values.absentPenalty)}
                      </strong>
                    </div>
                    <div>
                      <small>Dam olish kuni bonusi · {values.restDayWorkDays} kun</small>
                      <strong className="text-green">{money(values.restDayBonus)}</strong>
                    </div>
                    <div>
                      <small>Qolgan oylik</small>
                      <strong className="text-green">
                        {money(values.remaining)}
                      </strong>
                    </div>
                    <div>
                      <small>
                        Abed puli jami · shu oy {money(values.abed)}
                      </small>
                      <strong>{money(values.abedTotal)}</strong>
                    </div>
                  </div>
                  <div className="staff-sales">
                    <span>Oy savdosi</span>
                    <strong>{money(amountSum(employeeSales))}</strong>{" "}
                    <small>· {values.absentDays} kun kelmadi</small>
                  </div>
                  {canManagePayroll && (
                    <div className="table-actions">
                      <button
                        className="button button-secondary button-small"
                        onClick={() => onMovement(employee, "advance")}
                      >
                        <FiDollarSign /> Avans berish
                      </button>
                      {abedPaymentsEnabled && <button
                        className="button button-tertiary button-small"
                        onClick={() => onMovement(employee, "abed")}
                      >
                        Abed pulini qayd etish
                      </button>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            title="Hodimlar hali qo‘shilmagan"
            text="Boshqa foydalanuvchilarga kirish berish uchun hodim qo‘shing."
          />
        )}
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>To‘lovlar tarixi</h2>
            <p>
              Avans oylikdan ushlanadi; Abed to‘lovlari {abedPaymentsEnabled ? "alohida qayd etiladi." : "o‘chirilgan (avvalgi yozuvlar tarixda saqlanadi)."}
            </p>
          </div>
        </div>
        {movements.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>HODIM</th>
                  <th>TURI</th>
                  <th>HISOB OYI</th>
                  <th>BERILGAN SANA</th>
                  <th>SUMMA</th>
                </tr>
              </thead>
              <tbody>
                {[...movements]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .map((movement) => (
                    <tr key={movement.id}>
                      <td>{movement.employeeName}</td>
                      <td>
                        <span
                          className={`status-pill ${movement.kind === "advance" ? "status-pending" : "status-paid"}`}
                        >
                          {movement.kind === "advance"
                            ? "Oylik avansi"
                            : "Abed puli"}
                        </span>
                      </td>
                      <td>{movement.period}</td>
                      <td>{movement.date || dateTime(movement.createdAt)}</td>
                      <td>
                        <strong>{money(movement.amount)}</strong>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Hali to‘lov qayd etilmagan"
            text="Ishchiga berilgan avans va Abed pullari shu jadvalda turadi."
          />
        )}
      </section>
    </>
  );
}

function ConfirmEmployeeRemoval({ onCancel, onConfirm }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setSaving(true);
    setError("");
    try {
      await onConfirm();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="remove-confirm-content">
      <p className="remove-warning">
        Xodim akkaunti, davomat, oylik avanslari va Abed yozuvlari o‘chadi. U
        ilgari sotgan tovarlari hamda chek tarixi saqlanadi.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button
          className="button button-secondary"
          disabled={saving}
          onClick={onCancel}
        >
          Bekor qilish
        </button>
        <button
          className="button button-danger"
          disabled={saving}
          onClick={confirm}
        >
          <FiTrash2 /> {saving ? "O‘chirilmoqda..." : "Butunlay chiqarish"}
        </button>
      </div>
    </div>
  );
}

function ConfirmManagerRemoval({ onCancel, onConfirm }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setSaving(true);
    setError("");
    try {
      await onConfirm();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="remove-confirm-content">
      <p className="remove-warning">
        Menejer akkaunti va unga tegishli kirish ma’lumotlari o‘chiriladi.
        Boshqa xodimlar va cheklar saqlanib qoladi.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button
          className="button button-secondary"
          disabled={saving}
          onClick={onCancel}
        >
          Bekor qilish
        </button>
        <button
          className="button button-danger"
          disabled={saving}
          onClick={confirm}
        >
          <FiTrash2 /> {saving ? "O‘chirilmoqda..." : "Menejerni chiqarish"}
        </button>
      </div>
    </div>
  );
}

function ConfirmCompanyRemoval({ company, onCancel, onConfirm }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setSaving(true);
    setError("");
    try {
      await onConfirm();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="remove-confirm-content">
      <p className="remove-warning">
        <strong>{company.name}</strong> bilan birga uning boshliq va hodim
        akkauntlari, tovarlari, cheklari, to‘lovlari, tariflari va barcha
        hisobotlari butunlay o‘chiriladi. Saqlab qolish uchun oldin
        `database.json` faylining zaxira nusxasini oling.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button
          className="button button-secondary"
          disabled={saving}
          onClick={onCancel}
        >
          Bekor qilish
        </button>
        <button
          className="button button-danger"
          disabled={saving}
          onClick={confirm}
        >
          <FiTrash2 />{" "}
          {saving ? "O‘chirilmoqda..." : "Do‘konni butunlay o‘chirish"}
        </button>
      </div>
    </div>
  );
}

function MyAccountPage({
  user,
  sales,
  movements,
  attendance,
  month,
  absentDeduction,
  restDayWorkBonusEnabled = false,
  restDayWorkBonusAmount = 0,
  abedPaymentsEnabled = true,
}) {
  const advances = movements
    .filter((item) => item.period === month && item.kind === "advance")
    .reduce((sum, item) => sum + item.amount, 0);
  const abed = movements
    .filter((item) => abedPaymentsEnabled && item.period === month && item.kind === "abed")
    .reduce((sum, item) => sum + item.amount, 0);
  const abedTotal = movements
    .filter((item) => abedPaymentsEnabled && item.kind === "abed")
    .reduce((sum, item) => sum + item.amount, 0);
  const startDate = user.startDate || user.createdAt?.slice(0, 10);
  const absentDays = attendance.filter(
    (item) =>
      item.employeeId === user.id &&
      item.status === "absent" &&
      item.date.slice(0, 7) === month &&
      (!startDate || item.date >= startDate) &&
      !isRestDay(
        {
          restDay: Number.isInteger(item.restDay) ? item.restDay : user.restDay,
        },
        item.date,
      ),
  ).length;
  const absentPenalty = absentDays * (absentDeduction || 0);
  const restDayWorkDays = attendance.filter(
    (item) =>
      item.status === "present" &&
      item.date.slice(0, 7) === month &&
      (!startDate || item.date >= startDate) &&
      isRestDay(
        { restDay: Number.isInteger(item.restDay) ? item.restDay : user.restDay },
        item.date,
      ),
  ).length;
  const restDayBonus = restDayWorkBonusEnabled
    ? restDayWorkDays * restDayWorkBonusAmount
    : 0;
  const ownSales = sales.filter(
    (sale) =>
      sale.sellerId === user.id && monthKey(new Date(sale.createdAt)) === month,
  );
  return (
    <>
      <PageHeading
        eyebrow="SHAXSIY HISOB"
        title={`Salom, ${user.name}`}
        description={`Sizga tegishli oylik va savdo ma’lumotlari. Haftalik dam olish kuni: ${weekdayName(user.restDay)}.`}
      />
      <div className="metric-grid">
        <Metric
          label="Oylik maosh"
          value={money(user.monthlySalary)}
          detail={localizedMonth(month)}
          icon={FiDollarSign}
          tone="green"
        />
        <Metric
          label="Olingan avans"
          value={money(advances)}
          detail="Oylikdan ushlanadi"
          icon={FiArrowDownLeft}
          tone="amber"
        />
        <Metric
          label="Jarima"
          value={money(absentPenalty)}
          detail={`${absentDays} kun kelmadi · oy oxirida ayriladi`}
          icon={FiClock}
          tone="red"
        />
        <Metric
          label="Qolgan oylik"
          value={money(
            Math.max(user.monthlySalary + restDayBonus - advances - absentPenalty, 0),
          )}
          detail={`Abed pulini o‘z ichiga olmaydi · Dam olish bonusi ${money(restDayBonus)}`}
          icon={FiCheck}
          tone="blue"
        />
        <Metric
          label="Dam olish kunidagi bonus"
          value={money(restDayBonus)}
          detail={`${restDayWorkDays} kun · ${restDayWorkBonusEnabled ? `${money(restDayWorkBonusAmount)} / kun` : "o‘chirilgan"}`}
          icon={FiCalendar}
          tone="green"
        />
        {abedPaymentsEnabled && <Metric
          label="Abed puli jami"
          value={money(abedTotal)}
          detail={`Shu oy: ${money(abed)} · oylikdan ayrilmaydi`}
          icon={FiBriefcase}
          tone="violet"
        />}
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Shu oydagi savdolarim</h2>
            <p>
              {ownSales.length} ta chek · {localizedMonth(month)}
            </p>
          </div>
          <strong>{money(amountSum(ownSales))}</strong>
        </div>
        {ownSales.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>CHEK</th>
                  <th>SANA</th>
                  <th>TOVARLAR</th>
                  <th>JAMI</th>
                </tr>
              </thead>
              <tbody>
                {ownSales.map((sale) => (
                  <tr key={sale.id}>
                    <td>№ {sale.receiptNumber}</td>
                    <td>{dateTime(sale.createdAt)}</td>
                    <td>
                      {sale.items
                        .map((item) => `${item.name} × ${item.quantity}`)
                        .join(", ")}
                    </td>
                    <td>{money(sale.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Hozircha savdo yo‘q"
            text="Savdolaringiz shu yerda ko‘rinadi."
          />
        )}
      </section>
    </>
  );
}

function AccessForm({ onSubmit, children, submitLabel = "Saqlash" }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSubmit(new FormData(event.currentTarget));
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="modal-form" onSubmit={submit}>
      {children}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="button button-primary" disabled={saving}>
          {saving ? "Saqlanmoqda..." : submitLabel} <FiCheck />
        </button>
      </div>
    </form>
  );
}

function CompanyForm({ month, onSubmit }) {
  return (
    <AccessForm
      onSubmit={(form) =>
        onSubmit({
          name: form.get("name"),
          ownerName: form.get("ownerName"),
          phone: form.get("phone"),
          login: form.get("login"),
          password: form.get("password"),
          monthlyFee: readNumber(form.get("monthlyFee")),
        })
      }
      submitLabel="Do‘kon yaratish"
    >
      <Field label="Do‘kon yoki brend nomi">
        <input
          name="name"
          required
          minLength="2"
          maxLength="80"
          placeholder="Masalan, Baraka Yem"
        />
      </Field>
      <Field label="Do‘kon boshlig‘i">
        <input
          name="ownerName"
          required
          minLength="2"
          maxLength="80"
          placeholder="Ism-familiya"
        />
      </Field>
      <Field label="Boshliq telefon raqami">
        <input
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="+998 90 123 45 67"
          maxLength="24"
        />
        <span className="field-hint">
          Obuna eslatmalari uchun. SMS yuborish xizmati alohida sozlanadi.
        </span>
      </Field>
      <Field label="Boshliq login">
        <input
          name="login"
          autoComplete="off"
          required
          minLength="3"
          maxLength="40"
          placeholder="Faqat shu do‘kon uchun"
        />
      </Field>
      <Field label="Boshlang‘ich parol">
        <PasswordInput
          name="password"
          autoComplete="new-password"
          required
          minLength="10"
          placeholder="Kamida 10 ta belgi"
        />
      </Field>
      <Field label={`${month} oyi uchun tarif`}>
        <MoneyField name="monthlyFee" required />
        <span className="field-hint">
          Tarif faqat shu oy amal qiladi. Keyingi oy uchun yangi tarif
          belgilanadi.
        </span>
      </Field>
      <p className="security-note">
        Login va parol yaratilgach boshliqqa xavfsiz tarzda yetkazing. Xodimlar
        loginini shu do‘kon boshlig‘i yaratadi.
      </p>
    </AccessForm>
  );
}

function FeeForm({ month, rate, onSubmit }) {
  const [period, setPeriod] = useState(month);
  return (
    <AccessForm
      onSubmit={(form) =>
        onSubmit({ period, monthlyFee: readNumber(form.get("monthlyFee")) })
      }
      submitLabel="Tarifni saqlash"
    >
      <Field label="Tarif amal qiladigan oy">
        <input
          type="month"
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
          required
        />
      </Field>
      <Field label={`${period} oyi uchun narx`}>
        <MoneyField
          key={`${period}-${rate?.amount || 0}`}
          name="monthlyFee"
          defaultValue={rate?.period === period ? rate.amount : ""}
          required
        />
      </Field>
      <p className="security-note">
        Bu narx faqat tanlangan oy uchun. Keyingi oyga o‘tkazilmaydi, ammo
        ortiqcha to‘langan pul balans sifatida saqlanib qoladi.
      </p>
    </AccessForm>
  );
}

function PaymentForm({ month, onSubmit }) {
  const [period, setPeriod] = useState(month);
  return (
    <AccessForm
      onSubmit={(form) =>
        onSubmit({ period, amount: readNumber(form.get("amount")) })
      }
      submitLabel="To‘lovni qayd etish"
    >
      <Field label="Qaysi oy uchun to‘lov">
        <input
          type="month"
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
          required
        />
      </Field>
      <Field label="Haqiqiy qabul qilingan summa">
        <MoneyField name="amount" required />
        <span className="field-hint">
          Oylik tarifdan ortiq qismi keyingi oylar uchun balans bo‘lib qoladi.
        </span>
      </Field>
      <label className="payment-confirm">
        <input name="confirmed" type="checkbox" required />
        <span>Pul haqiqatda qabul qilinganini tasdiqlayman.</span>
      </label>
      <p className="security-note">
        Bu amal pul o‘tkazmaydi. To‘lov kelib tushganidan keyin platforma egasi
        uni qo‘lda qayd qiladi.
      </p>
    </AccessForm>
  );
}

function ContactSettingsForm({
  phone,
  telegram,
  onSubmit,
  onClearPhone,
  submitLabel = "Aloqa ma’lumotlarini saqlash",
}) {
  return (
    <AccessForm
      onSubmit={(form) =>
        onSubmit({ phone: form.get("phone"), telegram: form.get("telegram") })
      }
      submitLabel={submitLabel}
    >
      <Field label="Bog‘lanish telefoni">
        <input
          name="phone"
          type="tel"
          defaultValue={phone}
          placeholder="+998 90 123 45 67"
          maxLength="24"
        />
      </Field>
      <Field label="Telegram username">
        <input
          name="telegram"
          type="text"
          defaultValue={telegram || "naziroff1"}
          placeholder="@username yoki username"
          maxLength="32"
        />
      </Field>
      <p className="security-note">
        Raqam va username landing sahifada hamma joyda avtomatik yangilanadi.
      </p>
      {onClearPhone && (
        <button
          className="button button-danger button-wide"
          type="button"
          onClick={onClearPhone}
        >
          Telefon raqamini olib tashlash
        </button>
      )}
    </AccessForm>
  );
}

function OwnerPasswordForm({ user, onSubmit }) {
  return (
    <AccessForm
      onSubmit={(form) => {
        const newPassword = String(form.get("newPassword") || "");
        const confirm = String(form.get("confirmPassword") || "");
        if (newPassword.length < 10)
          throw new Error(
            "Yangi parol kamida 10 ta belgidan iborat bo‘lishi kerak.",
          );
        if (newPassword !== confirm)
          throw new Error("Yangi parollar bir xil emas.");
        return onSubmit({
          currentPassword: String(form.get("currentPassword") || ""),
          login: user.login,
          newPassword,
        });
      }}
      submitLabel="Parolni yangilash"
    >
      <Field label="Joriy owner parol">
        <PasswordInput
          name="currentPassword"
          autoComplete="current-password"
          required
        />
      </Field>
      <Field label="Yangi owner parol">
        <PasswordInput
          name="newPassword"
          autoComplete="new-password"
          required
          minLength="10"
        />
      </Field>
      <Field label="Yangi parolni takrorlang">
        <PasswordInput
          name="confirmPassword"
          autoComplete="new-password"
          required
          minLength="10"
        />
      </Field>
      <p className="security-note">
        Bu parol faqat owner/administrator uchun ishlatiladi.
      </p>
    </AccessForm>
  );
}

function ProductForm({ product, onSubmit }) {
  const [unit, setUnit] = useState(product?.unit || "bag");
  return (
    <AccessForm
      onSubmit={(form) =>
        onSubmit(
          product
            ? {
                name: form.get("name"),
                costPrice: readNumber(form.get("costPrice")),
                price: readNumber(form.get("price")),
                minimumPrice: readNumber(form.get("minimumPrice")),
              }
            : {
                name: form.get("name"),
                unit,
                quantity: Number(form.get("quantity")),
                quantityUnit: ["weight", "liter"].includes(unit)
                  ? form.get("quantityUnit")
                  : unit,
                lowStockThreshold: Number(form.get("lowStockThreshold")),
                thresholdUnit: ["weight", "liter"].includes(unit)
                  ? form.get("thresholdUnit")
                  : unit,
                costPrice: readNumber(form.get("costPrice")),
                price: readNumber(form.get("price")),
                minimumPrice: readNumber(form.get("minimumPrice")),
              },
        )
      }
      submitLabel={product ? "Narxni saqlash" : "Kirimni saqlash"}
    >
      <Field label="Tovar nomi">
        <input
          name="name"
          required
          minLength="2"
          maxLength="80"
          defaultValue={product?.name || ""}
          placeholder="Masalan, kepak"
        />
      </Field>
      {!product && (
        <Field label="Hisob birligi">
          <select
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
          >
            <option value="bag">Qop</option>
            <option value="weight">Vazn (kg / tonna)</option>
            <option value="liter">litr</option>
            <option value="piece">dona</option>
            <option value="block">blok</option>
          </select>
        </Field>
      )}
      {!product && (
        <div className="field-row">
          <Field label="Kelgan miqdor">
            <input
              name="quantity"
              type="number"
              min={["bag", "piece", "block"].includes(unit) ? "1" : "0.001"}
              step={["bag", "piece", "block"].includes(unit) ? "1" : "0.001"}
              required
              placeholder="0"
            />
          </Field>
          {["weight", "liter"].includes(unit) && (
            <Field label="Kirim birligi">
              <select name="quantityUnit">
                {unit === "weight" ? (
                  <>
                    <option value="kg">Kilogramm</option>
                    <option value="ton">Tonna</option>
                  </>
                ) : (
                  <>
                    <option value="l">litr</option>
                    <option value="ml">millilitr</option>
                  </>
                )}
              </select>
            </Field>
          )}
        </div>
      )}
      {!product && (
        <div className="field-row">
          <Field label={`Qoldiq eslatmasi (${unitName(unit)} qolganda)`}>
            <input
              name="lowStockThreshold"
              type="number"
              min="0"
              step={["bag", "piece", "block"].includes(unit) ? "1" : "0.001"}
              defaultValue="0"
              required
            />
          </Field>
          {["weight", "liter"].includes(unit) && (
            <Field label="Eslatma birligi">
              <select name="thresholdUnit">
                {unit === "weight" ? (
                  <>
                    <option value="kg">Kilogramm</option>
                    <option value="ton">Tonna</option>
                  </>
                ) : (
                  <>
                    <option value="l">litr</option>
                    <option value="ml">millilitr</option>
                  </>
                )}
              </select>
            </Field>
          )}
        </div>
      )}
      <Field label={`Tan narx (1 ${unitName(product?.unit || unit)})`}>
        <MoneyField
          name="costPrice"
          defaultValue={product?.costPrice ?? product?.price}
          required
        />
      </Field>
      <Field
        label={`Sotuv narxi (1 ${unitName(product?.unit || unit)})`}
      >
        <MoneyField name="price" defaultValue={product?.price} required />
      </Field>
      <Field label="Eng past sotuv narxi">
        <MoneyField
          name="minimumPrice"
          defaultValue={product?.minimumPrice}
          required
        />
        <span className="field-hint">
          Belgilangan eng past narxning o‘zida ham savdo qilish mumkin.
        </span>
      </Field>
    </AccessForm>
  );
}

function StockForm({ product, onSubmit }) {
  const [unit, setUnit] = useState(
    product.unit === "weight"
      ? "kg"
      : product.unit === "liter"
        ? product.volumeUnit || "l"
        : product.unit,
  );
  return (
    <AccessForm
      onSubmit={(form) =>
        onSubmit({
          quantity: Number(form.get("quantity")),
          unit,
          costPrice: readNumber(form.get("costPrice")),
        })
      }
      submitLabel="Kirimni saqlash"
    >
      <Field label="Kelgan miqdor">
        <input
          name="quantity"
          type="number"
          min={["bag", "piece", "block"].includes(product.unit) ? "1" : "0.001"}
          step={["bag", "piece", "block"].includes(product.unit) ? "1" : "0.001"}
          required
          placeholder="0"
        />
      </Field>
      {product.unit === "liter" || product.unit === "weight" ? (
        <Field label="Kirim birligi">
          <select
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
          >
            {product.unit === "weight" ? (
              <>
                <option value="kg">Kilogramm</option>
                <option value="ton">Tonna</option>
              </>
            ) : (
              <>
                <option value="l">litr</option>
                <option value="ml">millilitr</option>
              </>
            )}
          </select>
        </Field>
      ) : null}
      <Field label={`Tan narx (1 ${unitName(product.unit)})`}>
        <MoneyField name="costPrice" defaultValue={product.costPrice} required />
      </Field>
      {["bag", "piece", "block"].includes(product.unit) && (
        <p className="security-note">
          Ushbu tovar butun birliklarda hisoblanadi.
        </p>
      )}
    </AccessForm>
  );
}

function EmployeeForm({ employee, onSubmit }) {
  const today = dayKey(useClock());
  return (
    <AccessForm
      onSubmit={(form) => {
        const result = {
          name: form.get("name"),
          monthlySalary: readNumber(form.get("monthlySalary")),
          startDate: form.get("startDate"),
          restDay: Number(form.get("restDay")),
        };
        if (!employee)
          Object.assign(result, {
            login: form.get("login"),
            password: form.get("password"),
          });
        return onSubmit(result);
      }}
      submitLabel={
        employee ? "O‘zgarishlarni saqlash" : "Hodim akkauntini yaratish"
      }
    >
      <Field label="Hodim ismi">
        <input
          name="name"
          required
          minLength="2"
          maxLength="80"
          defaultValue={employee?.name || ""}
          placeholder="Ism-familiya"
        />
      </Field>
      <Field label="Ish boshlagan sana">
        <input
          name="startDate"
          type="date"
          max={today}
          defaultValue={
            employee?.startDate || employee?.createdAt?.slice(0, 10) || today
          }
          required
        />
      </Field>
      {!employee && (
        <>
          <Field label="Hodim login">
            <input
              name="login"
              autoComplete="off"
              required
              minLength="3"
              maxLength="40"
              placeholder="Boshqa brendlarda ishlamaydi"
            />
          </Field>
          <Field label="Boshlang‘ich parol">
            <PasswordInput
              name="password"
              autoComplete="new-password"
              required
              minLength="10"
              placeholder="Kamida 10 ta belgi"
            />
          </Field>
        </>
      )}
      {employee && (
        <p className="security-note">
          Login: <strong>{employee.login}</strong>
        </p>
      )}
      <Field label="Oylik maosh">
        <MoneyField
          name="monthlySalary"
          defaultValue={employee?.monthlySalary}
          required
        />
      </Field>
      <Field label="Haftalik dam olish kuni">
        <select name="restDay" defaultValue={employee?.restDay ?? ""} required>
          <option value="" disabled>
            Dam olish kunini tanlang
          </option>
          {weekdays.map((day) => (
            <option key={day.value} value={day.value}>
              {day.label}
            </option>
          ))}
        </select>
      </Field>
    </AccessForm>
  );
}

function ManagerForm({ manager, onSubmit }) {
  return (
    <AccessForm
      onSubmit={(form) => {
        const result = {
          name: form.get("name"),
          monthlySalary: readNumber(form.get("monthlySalary")),
        };
        if (!manager)
          Object.assign(result, {
            login: form.get("login"),
            password: form.get("password"),
          });
        return onSubmit(result);
      }}
      submitLabel={
        manager ? "O‘zgarishlarni saqlash" : "Menejer akkauntini yaratish"
      }
    >
      <Field label="Menejer ismi">
        <input
          name="name"
          required
          minLength="2"
          maxLength="80"
          defaultValue={manager?.name || ""}
          placeholder="Ism-familiya"
        />
      </Field>
      {!manager && (
        <>
          <Field label="Menejer login">
            <input
              name="login"
              autoComplete="off"
              required
              minLength="3"
              maxLength="40"
              placeholder="Do‘kondagi login"
            />
          </Field>
          <Field label="Boshlang‘ich parol">
            <PasswordInput
              name="password"
              autoComplete="new-password"
              required
              minLength="10"
              placeholder="Kamida 10 ta belgi"
            />
          </Field>
        </>
      )}
      {manager && (
        <p className="security-note">
          Login: <strong>{manager.login}</strong>
        </p>
      )}
      <Field label="Oylik maosh">
        <MoneyField
          name="monthlySalary"
          defaultValue={manager?.monthlySalary}
          required
        />
      </Field>
    </AccessForm>
  );
}

function MovementForm({ kind, month, onSubmit }) {
  const today = dayKey(useClock());
  return (
    <AccessForm
      onSubmit={(form) => {
        const date = kind === "abed" ? form.get("date") : today;
        return onSubmit({
          kind,
          amount: readNumber(form.get("amount")),
          date,
          period: kind === "abed" ? date.slice(0, 7) : form.get("period"),
        });
      }}
      submitLabel={
        kind === "advance" ? "Avansni saqlash" : "Abed pulini saqlash"
      }
    >
      {kind === "advance" ? (
        <Field label="Hisob oyi">
          <input name="period" type="month" defaultValue={month} required />
        </Field>
      ) : (
        <Field label="Abed puli berilgan sana">
          <input name="date" type="date" defaultValue={today} required />
        </Field>
      )}
      <Field label="Berilgan summa">
        <MoneyField name="amount" required />
      </Field>
      <p
        className={
          kind === "advance" ? "security-note" : "security-note accent-note"
        }
      >
        {kind === "advance"
          ? "Avans tanlangan oy oyligidan ushlab qolinadi."
          : "Abed puli tarixda saqlanadi, oylik qoldig‘iga ta’sir qilmaydi."}
      </p>
    </AccessForm>
  );
}

function Field({ label, children }) {
  return (
    <label className="field-label">
      <span>{label}</span>
      {children}
    </label>
  );
}

function PasswordInput({ ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="password-input-wrap">
      <input
        {...props}
        className={`password-input ${props.className || ""}`.trim()}
        type={visible ? "text" : "password"}
      />
      <button
        type="button"
        className="password-visibility"
        aria-label={visible ? "Parolni yashirish" : "Parolni ko‘rsatish"}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <FiEyeOff /> : <FiEye />}
      </button>
    </span>
  );
}

function MoneyField({ name, defaultValue, required, readOnly = false }) {
  const [value, setValue] = useState(
    defaultValue !== undefined && defaultValue !== null
      ? numberInput(defaultValue)
      : "",
  );
  return (
    <div className="money-field">
      <input
        name={name}
        type="text"
        inputMode="numeric"
        readOnly={readOnly}
        value={value}
        onChange={(event) =>
          setValue(numberInput(readNumber(event.target.value)))
        }
        placeholder="0"
        required={required}
      />
      <span>so‘m</span>
    </div>
  );
}

function NotificationCenter({
  company,
  subscription,
  supportContacts,
  notifications: stockNotifications = [],
  products = [],
  now,
}) {
  const storageKey = `yemzor:notifications-seen:${company?.id}`;
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const notifications = [
    ...productUpdates.map((update) => ({ ...update, kind: "update" })),
    ...stockNotifications,
    getBillingReminder(company, subscription, now, supportContacts),
  ]
    .filter(Boolean)
    .sort((first, second) => second.date.localeCompare(first.date));
  const visibleNotifications = notifications.filter(
    (notification) => !seenIds.includes(notification.id),
  );
  const inventoryProducts = products
    .filter((product) => product.active !== false)
    .sort((first, second) => first.quantity - second.quantity);
  const unreadCount = notifications.filter(
    (notification) => !seenIds.includes(notification.id),
  ).length;
  useEffect(() => {
    if (!open) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);
  function markSeen(ids) {
    const updated = [...new Set([...seenIds, ...ids])];
    setSeenIds(updated);
    window.localStorage.setItem(storageKey, JSON.stringify(updated));
  }
  function closeDialog() {
    if (notifications.length) {
      markSeen(notifications.map((notification) => notification.id));
    }
    setOpen(false);
  }
  function toggle() {
    setOpen((current) => !current);
  }
  return (
    <div className="notification-center">
      <button
        className="notification-trigger"
        type="button"
        onClick={toggle}
        aria-label={`Bildirishnomalar${unreadCount ? `, ${unreadCount} ta yangi` : ""}`}
        aria-expanded={open}
      >
        <FiBell />
        {unreadCount > 0 && (
          <span className="notification-count">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open &&
        createPortal(
          <div
            className="notification-overlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeDialog();
            }}
          >
            <section
              className="notification-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="notification-title"
            >
              <header>
                <div>
                  <span className="notification-dialog-icon">
                    <FiBell />
                  </span>
                  <div>
                    <strong id="notification-title">Bildirishnomalar</strong>
                    <span>
                      {visibleNotifications.length} ta yangi xabar ·{" "}
                      {inventoryProducts.length} ta tovar qoldig‘i
                    </span>
                  </div>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Yopish"
                  onClick={closeDialog}
                >
                  <FiX />
                </button>
              </header>
              {visibleNotifications.length ? (
                <div className="notification-list">
                  {visibleNotifications.map((notification) => (
                    <article
                      className={`notification-item ${notification.kind}`}
                      key={notification.id}
                    >
                      <span className="notification-item-icon">
                        {notification.kind === "billing" ? (
                          <FiClock />
                        ) : (
                          <FiActivity />
                        )}
                      </span>
                      <div>
                        <strong>{notification.title}</strong>
                        <p>{notification.message}</p>
                        <small>{notification.date}</small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="notification-empty">
                  Yangi xabar yo‘q.
                </p>
              )}
              <section className="notification-inventory">
                <h3><FiBox /> Ombor qoldig‘i</h3>
                {inventoryProducts.length ? (
                  <div className="notification-inventory-list">
                    {inventoryProducts.map((product) => (
                      <div className="notification-inventory-row" key={product.id}>
                        <span>{product.name}</span>
                        <strong className={product.quantity <= 0 ? "out-of-stock" : ""}>
                          {quantityLabel(product)}
                        </strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="notification-inventory-empty">
                    Omborda hozircha tovar yo‘q.
                  </p>
                )}
              </section>
              <footer>
                <span>Yemzor · Yangiliklar va to‘lov eslatmalari</span>
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={closeDialog}
                >
                  Yopish
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
    </div>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
  className = "",
  backdropClassName = "",
}) {
  return createPortal(
    <div
      className={`modal-backdrop ${backdropClassName}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`modal-card ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <header className="modal-heading">
          <div>
            <span className="eyebrow">HISOBLI</span>
            <h2 id="dialog-title">{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Yopish"
          >
            <FiX />
          </button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  );
}

function Empty({ title, text }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <FiBox />
      </span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function Loading() {
  return (
    <div className="loading-state">
      <span className="spinner" /> Ma’lumotlar yuklanmoqda...
    </div>
  );
}

export default memo(App);
