// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Stepper } from './ui'

function Harness({ initial = null as number | null, step = 2.5 }) {
  const [v, setV] = useState<number | null>(initial)
  return (
    <>
      <Stepper value={v} onChange={setV} step={step} decimals={2} />
      <button type="button" onClick={() => setV((x) => (x ?? 0) + 10)}>ภายนอก</button>
      <output data-testid="value">{v === null ? 'null' : String(v)}</output>
    </>
  )
}

const value = () => screen.getByTestId('value').textContent
afterEach(cleanup)

describe('Stepper (น้ำหนักที่ยก)', () => {
  it('กด + / − ตาม step', async () => {
    const u = userEvent.setup()
    render(<Harness initial={25} />)
    await u.click(screen.getByLabelText('เพิ่ม'))
    expect(value()).toBe('27.5')
    await u.click(screen.getByLabelText('ลด'))
    await u.click(screen.getByLabelText('ลด'))
    expect(value()).toBe('22.5')
  })
  it('เริ่มจากว่างแล้วกด + ได้', async () => {
    const u = userEvent.setup()
    render(<Harness />)
    await u.click(screen.getByLabelText('เพิ่ม'))
    expect(value()).toBe('2.5')
  })
  it('พิมพ์ทศนิยมได้ เช่น 12.5', async () => {
    const u = userEvent.setup()
    render(<Harness initial={25} />)
    const input = screen.getByRole('textbox')
    await u.clear(input)
    await u.type(input, '12.5')
    expect((input as HTMLInputElement).value).toBe('12.5')
    expect(value()).toBe('12.5')
    await u.tab()
    expect((input as HTMLInputElement).value).toBe('12.5')
  })
  it('พิมพ์แล้วกด + ต่อได้ และลบจนว่างได้', async () => {
    const u = userEvent.setup()
    render(<Harness initial={25} />)
    const input = screen.getByRole('textbox')
    await u.clear(input)
    expect(value()).toBe('null')
    await u.type(input, '30')
    await u.click(screen.getByLabelText('เพิ่ม'))
    expect(value()).toBe('32.5')
    expect((input as HTMLInputElement).value).toBe('32.5')
  })
  it('ค่าเปลี่ยนจากภายนอก (ปุ่ม +2.5lb ทุกเซ็ต) ช่องแสดงค่าใหม่', async () => {
    const u = userEvent.setup()
    render(<Harness initial={25} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    await u.clear(input)
    await u.type(input, '20')
    await u.click(screen.getByText('ภายนอก'))
    expect(value()).toBe('30')
    expect(input.value).toBe('30')
  })
})
