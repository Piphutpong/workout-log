import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { Button, Card, ErrorBox, Input } from '@/components/ui'

const schema = z.object({
  email: z.string().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(6, 'รหัสผ่านอย่างน้อย 6 ตัวอักษร'),
})
type Form = z.infer<typeof schema>

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [error, setError] = useState<unknown>(null)
  const [info, setInfo] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = async (f: Form) => {
    setError(null)
    setInfo(null)
    const res = mode === 'login'
      ? await supabase.auth.signInWithPassword(f)
      : await supabase.auth.signUp(f)
    if (res.error) setError(new Error(res.error.message === 'Invalid login credentials' ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : res.error.message))
    else if (mode === 'signup' && !res.data.session) setInfo('สมัครแล้ว กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ')
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <div className="text-5xl">🏋️‍♂️🏃</div>
        <h1 className="mt-3 text-3xl font-bold">Workout Log</h1>
        <p className="text-slate-500">บันทึกเวท วิ่ง โภชนาการ และร่างกาย</p>
      </div>
      <Card>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <Input label="อีเมล" type="email" autoComplete="email" {...register('email')} error={formState.errors.email?.message} />
          <Input
            label="รหัสผ่าน"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            {...register('password')}
            error={formState.errors.password?.message}
          />
          <ErrorBox error={error} />
          {info && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{info}</p>}
          <Button type="submit" block size="lg" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? 'กำลังดำเนินการ…' : mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
          </Button>
        </form>
        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-blue-700 dark:text-blue-300"
          onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
        >
          {mode === 'login' ? 'ยังไม่มีบัญชี? สมัครสมาชิก' : 'มีบัญชีแล้ว? เข้าสู่ระบบ'}
        </button>
      </Card>
    </div>
  )
}
