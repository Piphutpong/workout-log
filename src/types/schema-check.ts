// ตรวจตอน typecheck ว่า types ใน database.ts มีคอลัมน์ตรงกับโครงสร้าง Google Sheet (src/lib/schema.ts)
// ถ้าเพิ่มคอลัมน์ที่ฝั่งใดฝั่งหนึ่งแล้วลืมอีกฝั่ง tsc จะฟ้องว่าตาราง/คอลัมน์ไหนไม่ตรง
import type { SCHEMA } from '@/lib/schema'
import type { Database } from './database'

type S = typeof SCHEMA
type H = Database['public']['Tables']

type SameKeys<A, B> = [Exclude<keyof A, keyof B>, Exclude<keyof B, keyof A>] extends [never, never]
  ? true
  : { missingInDatabaseTs: Exclude<keyof A, keyof B>; missingInSchemaTs: Exclude<keyof B, keyof A> }

type Check = { [K in keyof S]: K extends keyof H ? SameKeys<S[K], H[K]['Row']> : { missingTable: K } }
type Reverse = { [K in keyof H]: K extends keyof S ? true : { notInSchema: K } }
type AllTrue<T> = T[keyof T] extends true ? true : T

export const schemaMatches: AllTrue<Check> = true
export const tablesMatch: AllTrue<Reverse> = true
