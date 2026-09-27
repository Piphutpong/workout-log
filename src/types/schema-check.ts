// ตรวจตอน typecheck ว่า model ใน database.ts มีคอลัมน์ตรงกับ types ที่ generate จากฐานข้อมูลจริง (supabase.ts)
// ถ้าเพิ่ม migration แล้วลืมแก้ database.ts → `npm run gen:types` แล้ว tsc จะฟ้องว่าตาราง/คอลัมน์ไหนไม่ตรง
import type { Database as Generated } from './supabase'
import type { Database as Handwritten } from './database'

type G = Generated['public']['Tables']
type H = Handwritten['public']['Tables']
type GV = Generated['public']['Views']
type HV = Handwritten['public']['Views']

type SameKeys<A, B> = [Exclude<keyof A, keyof B>, Exclude<keyof B, keyof A>] extends [never, never]
  ? true
  : { missingInDatabaseTs: Exclude<keyof A, keyof B>; notInDatabase: Exclude<keyof B, keyof A> }

type TableCheck = { [K in keyof G]: K extends keyof H ? SameKeys<G[K]['Row'], H[K]['Row']> : { missingTable: K } }
type ViewCheck = { [K in keyof HV]: K extends keyof GV ? SameKeys<GV[K]['Row'], HV[K]['Row']> : { missingView: K } }
type AllTrue<T> = T[keyof T] extends true ? true : T

export const tablesMatch: AllTrue<TableCheck> = true
export const viewsMatch: AllTrue<ViewCheck> = true
