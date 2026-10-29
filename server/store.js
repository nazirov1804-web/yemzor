import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const databasePath = process.env.DATABASE_FILE
  ? resolve(process.env.DATABASE_FILE)
  : fileURLToPath(new URL('../database.json', import.meta.url))
let database
let writeQueue = Promise.resolve()

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

async function persist(nextDatabase) {
  const temporaryPath = resolve(dirname(databasePath), `.database-${randomUUID()}.tmp`)
  try {
    await writeFile(temporaryPath, `${JSON.stringify(nextDatabase, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    await rename(temporaryPath, databasePath)
  } catch (error) {
    try {
      await unlink(temporaryPath)
    } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') console.error('Vaqtinchalik baza faylini tozalab bo‘lmadi:', cleanupError)
    }
    throw error
  }
}

export async function initializeDatabase() {
  await mkdir(dirname(databasePath), { recursive: true })
  try {
    const parsed = JSON.parse(await readFile(databasePath, 'utf8'))
    const collections = ['users', 'companies', 'products', 'sales', 'receipts', 'movements', 'subscriptions']
    if (!parsed || collections.some((key) => !Array.isArray(parsed[key]))) {
      throw new Error('database.json ichida kerakli ro‘yxatlar bo‘lishi kerak; faylni tiklash o‘rniga zaxira nusxasini tekshiring.')
    }
    let changed = false
    if (!Array.isArray(parsed.attendance)) {
      parsed.attendance = []
      changed = true
    }
    if (!Array.isArray(parsed.demoRegistrations)) {
      parsed.demoRegistrations = []
      changed = true
    }
    if (!Array.isArray(parsed.subscriptionRates)) {
      parsed.subscriptionRates = []
      changed = true
    }
    if (!Array.isArray(parsed.notifications)) {
      parsed.notifications = []
      changed = true
    }
    if (!parsed.platformSettings || typeof parsed.platformSettings !== 'object') {
      parsed.platformSettings = { phone: '', telegram: 'naziroff1' }
      changed = true
    } else {
      if (typeof parsed.platformSettings.phone !== 'string') {
        parsed.platformSettings.phone = ''
        changed = true
      }
      if (typeof parsed.platformSettings.telegram !== 'string') {
        parsed.platformSettings.telegram = 'naziroff1'
        changed = true
      }
    }
    for (const company of parsed.companies) {
      if (!Number.isSafeInteger(company.absentDeduction)) {
        company.absentDeduction = 0
        changed = true
      }
    }
    for (const product of parsed.products) {
      if (product.active === undefined) {
        product.active = true
        changed = true
      }
      if (product.unit === 'liter' && !product.volumeUnit) {
        product.volumeUnit = 'l'
        changed = true
      }
      if (!Number.isFinite(product.lowStockThreshold) || product.lowStockThreshold < 0) {
        product.lowStockThreshold = 0
        changed = true
      }
      if (!product.lowStockUnit) {
        product.lowStockUnit = product.unit === 'weight'
          ? 'kg'
          : product.unit === 'liter'
            ? 'l'
            : product.unit
        changed = true
      }
    }
    for (const company of parsed.companies) {
      if (!Number.isSafeInteger(company.monthlyFee)) {
        company.monthlyFee = 0
        changed = true
      }
      if (company.restDayWorkBonusEnabled === undefined) {
        company.restDayWorkBonusEnabled = false
        changed = true
      }
      if (company.restDayWorkBonusAmount === undefined) {
        company.restDayWorkBonusAmount = 0
        changed = true
      }
      if (company.abedPaymentsEnabled === undefined) {
        company.abedPaymentsEnabled = true
        changed = true
      }
    }
    database = parsed
    if (changed) await persist(database)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    database = {
      users: [],
      companies: [],
      products: [],
      sales: [],
      receipts: [],
      movements: [],
      subscriptions: [],
      subscriptionRates: [],
      attendance: [],
      notifications: [],
      demoRegistrations: [],
      platformSettings: { phone: '', telegram: 'naziroff1' },
    }
    await persist(database)
  }
}

export function readDatabase() {
  if (!database) throw new Error('database.json hali ishga tushmagan.')
  return clone(database)
}

export function updateDatabase(update) {
  const operation = writeQueue.then(async () => {
    if (!database) throw new Error('database.json hali ishga tushmagan.')
    const draft = clone(database)
    const result = await update(draft)
    await persist(draft)
    database = draft
    return clone(result)
  })
  writeQueue = operation.catch(() => {})
  return operation
}
