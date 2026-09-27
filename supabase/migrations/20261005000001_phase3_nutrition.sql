-- =============================================================================
-- Phase 3: โภชนาการ — คลังอาหารตั้งต้น, Adaptive TDEE, ข้อมูลความถี่การใช้อาหาร
-- ค่าโภชนาการทั้งหมดเป็นค่าประมาณ (is_estimate = true) ต่อ 1 หน่วยบริโภค (serving_desc / serving_g)
-- =============================================================================

-- โหมดโภชนาการ: cut = ลดน้ำหนัก, maintenance = คงน้ำหนัก
alter table public.settings
  add column nutrition_mode text not null default 'cut' check (nutrition_mode in ('cut','maintenance'));

-- ---------------------------------------------------------------------------
-- ข้อเสนอปรับเป้าแคลอรี่ (สร้างทุกวันจันทร์ ต้องกดยืนยันก่อนเปลี่ยน)
-- ---------------------------------------------------------------------------
create table public.tdee_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  week_start date not null,
  mode text not null check (mode in ('cut','maintenance')),
  tdee int,
  avg_kcal int,
  weight_change_kg numeric(5,2),
  window_days int,
  days_logged int,
  current_avg_target int,
  proposed_delta int,
  status text not null default 'pending' check (status in ('pending','accepted','dismissed','insufficient')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);
create trigger tdee_proposals_updated_at before update on public.tdee_proposals
  for each row execute function public.set_updated_at();
alter table public.tdee_proposals enable row level security;
create policy "own rows" on public.tdee_proposals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- ความถี่การใช้อาหาร (ใช้เรียง "ล่าสุด/บ่อย" ในหน้าค้นหา)
-- ---------------------------------------------------------------------------
create view public.food_usage with (security_invoker = true) as
select user_id, food_id, recipe_id, count(*) as uses, max(date) as last_used, max(created_at) as last_at
from public.food_log
where food_id is not null or recipe_id is not null
group by user_id, food_id, recipe_id;

-- ---------------------------------------------------------------------------
-- ข้อมูลตั้งต้นสำหรับ Adaptive TDEE (ฝั่ง client เป็นคนคำนวณ/ตัดสินใจ)
-- p_end = วันสุดท้ายของช่วง (ปกติ = เมื่อวาน เพราะวันนี้ยังกินไม่ครบ)
-- ---------------------------------------------------------------------------
create or replace function public.tdee_inputs(p_end date default public.bkk_today() - 1)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  uid uuid := auth.uid();
  res jsonb := '{}';
  w int;
  d date;
  tgt numeric := 0;
  n int := 0;
  v_kcal numeric;
begin
  foreach w in array array[14, 28] loop
    res := res || jsonb_build_object(
      'w' || w, jsonb_build_object(
        'days_logged', (select count(distinct date) from public.food_log where user_id = uid and date between p_end - w + 1 and p_end),
        'avg_kcal', (select round(avg(k)) from (select sum(calories) as k from public.food_log
                      where user_id = uid and date between p_end - w + 1 and p_end group by date) x),
        'weight_first', (select round(avg(weight_kg), 2) from public.body_weight where user_id = uid and date between p_end - w + 1 and p_end - w + 7),
        'weight_last', (select round(avg(weight_kg), 2) from public.body_weight where user_id = uid and date between p_end - 6 and p_end)
      ));
  end loop;

  -- เป้าแคลอรี่เฉลี่ยของ 7 วันข้างหน้า (ตามประเภทวันจากแผน)
  for d in select generate_series(p_end + 1, p_end + 7, interval '1 day')::date loop
    select t.kcal into v_kcal from public.nutrition_targets t
     where t.user_id = uid and t.day_type = public.today_plan(d)->>'day_type';
    if v_kcal is not null then
      tgt := tgt + v_kcal;
      n := n + 1;
    end if;
  end loop;

  return res || jsonb_build_object(
    'end', p_end,
    'current_avg_target', case when n > 0 then round(tgt / n) end,
    'mode', (select nutrition_mode from public.settings where user_id = uid),
    'weight_goal_done', exists (select 1 from public.goals where user_id = uid and metric = 'weight_kg' and status = 'done')
                     or exists (select 1 from public.goal_progress() where metric = 'weight_kg' and state = 'done')
  );
end $$;

revoke all on function public.tdee_inputs(date) from public, anon;
grant execute on function public.tdee_inputs(date) to authenticated;

-- ---------------------------------------------------------------------------
-- คลังอาหารไทยตั้งต้น (~90 รายการ) — ทุกรายการเป็นค่าประมาณ
-- "u": true = ค่าอาจคลาดเคลื่อนมาก (แกงกะทิ ของทอด ข้าวมัน เครื่องดื่มหวาน ฯลฯ) ดู supabase/FOODS_REVIEW.md
-- ---------------------------------------------------------------------------
create or replace function public.seed_foods(p_uid uuid)
returns boolean language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.foods where user_id = p_uid and source = 'seed') then
    return false;
  end if;
  insert into public.foods (user_id, name, name_en, serving_desc, serving_g, calories, protein_g, carb_g, fat_g,
                            fiber_g, sodium_mg, category, source, is_estimate, is_favorite)
  select p_uid, x->>'n', x->>'en', x->>'s', (x->>'g')::numeric, (x->>'k')::numeric, (x->>'p')::numeric,
         (x->>'c')::numeric, (x->>'f')::numeric, (x->>'fb')::numeric, (x->>'na')::numeric, x->>'cat',
         'seed', true, coalesce((x->>'fav')::boolean, false)
  from jsonb_array_elements($foods$[
    {"n":"ข้าวสวย","en":"Steamed jasmine rice","s":"1 ทัพพี","g":60,"k":78,"p":1.6,"c":17.4,"f":0.2,"fb":0.2,"na":1,"cat":"ข้าว/แป้ง"},
    {"n":"ข้าวสวย (จาน)","en":"Steamed rice, plate","s":"1 จาน","g":180,"k":234,"p":4.8,"c":52,"f":0.5,"fb":0.6,"na":2,"cat":"ข้าว/แป้ง"},
    {"n":"ข้าวกล้อง","en":"Brown rice","s":"1 ทัพพี","g":60,"k":67,"p":1.5,"c":14,"f":0.5,"fb":1.1,"na":2,"cat":"ข้าว/แป้ง"},
    {"n":"ข้าวเหนียว","en":"Sticky rice","s":"1 ห่อ","g":100,"k":170,"p":3.5,"c":37,"f":0.3,"fb":1,"na":5,"cat":"ข้าว/แป้ง","u":true},
    {"n":"ขนมปังโฮลวีต","en":"Whole wheat bread","s":"1 แผ่น","g":30,"k":75,"p":3.5,"c":13,"f":1,"fb":2,"na":130,"cat":"ข้าว/แป้ง"},
    {"n":"ข้าวโอ๊ต","en":"Rolled oats (dry)","s":"4 ช้อนโต๊ะ","g":40,"k":150,"p":5,"c":27,"f":3,"fb":4,"na":2,"cat":"ข้าว/แป้ง"},
    {"n":"มันเทศนึ่ง","en":"Steamed sweet potato","s":"1 หัวเล็ก","g":100,"k":90,"p":1.6,"c":21,"f":0.1,"fb":3,"na":36,"cat":"ข้าว/แป้ง"},
    {"n":"ข้าวโพดต้ม","en":"Boiled corn","s":"1 ฝัก","g":100,"k":100,"p":3.5,"c":22,"f":1.5,"fb":2.5,"na":1,"cat":"ข้าว/แป้ง"},
    {"n":"กะเพราไก่ + ข้าว","en":"Basil chicken with rice","s":"1 จาน","g":350,"k":580,"p":28,"c":75,"f":18,"fb":2,"na":1300,"cat":"อาหารจานเดียว"},
    {"n":"กะเพราหมูสับ + ข้าว","en":"Basil minced pork with rice","s":"1 จาน","g":350,"k":620,"p":25,"c":75,"f":24,"fb":2,"na":1300,"cat":"อาหารจานเดียว","u":true},
    {"n":"ไข่ดาว","en":"Fried egg","s":"1 ฟอง","g":55,"k":110,"p":6,"c":0.5,"f":9,"fb":0,"na":90,"cat":"กับข้าว","u":true},
    {"n":"ไข่เจียว","en":"Thai omelette","s":"1 ฟอง","g":70,"k":190,"p":7,"c":1,"f":17,"fb":0,"na":300,"cat":"กับข้าว","u":true},
    {"n":"ข้าวไข่เจียว","en":"Omelette on rice","s":"1 จาน","g":280,"k":600,"p":18,"c":60,"f":32,"fb":1,"na":700,"cat":"อาหารจานเดียว","u":true},
    {"n":"ข้าวมันไก่ต้ม","en":"Hainanese chicken rice (boiled)","s":"1 จาน","g":350,"k":600,"p":28,"c":70,"f":22,"fb":1,"na":1100,"cat":"อาหารจานเดียว","u":true},
    {"n":"ข้าวมันไก่ทอด","en":"Hainanese chicken rice (fried)","s":"1 จาน","g":350,"k":700,"p":28,"c":75,"f":32,"fb":1,"na":1100,"cat":"อาหารจานเดียว","u":true},
    {"n":"ข้าวผัดหมู","en":"Pork fried rice","s":"1 จาน","g":320,"k":600,"p":20,"c":80,"f":20,"fb":2,"na":1200,"cat":"อาหารจานเดียว","u":true},
    {"n":"ข้าวผัดกุ้ง","en":"Shrimp fried rice","s":"1 จาน","g":320,"k":580,"p":22,"c":78,"f":18,"fb":2,"na":1200,"cat":"อาหารจานเดียว","u":true},
    {"n":"หมูกระเทียม + ข้าว","en":"Garlic pork with rice","s":"1 จาน","g":330,"k":600,"p":28,"c":70,"f":22,"fb":1,"na":1100,"cat":"อาหารจานเดียว","u":true},
    {"n":"ข้าวขาหมู","en":"Stewed pork leg rice","s":"1 จาน","g":350,"k":690,"p":30,"c":75,"f":30,"fb":1,"na":1500,"cat":"อาหารจานเดียว","u":true},
    {"n":"ข้าวหมูแดง","en":"Red BBQ pork rice","s":"1 จาน","g":330,"k":540,"p":25,"c":75,"f":14,"fb":1,"na":1300,"cat":"อาหารจานเดียว"},
    {"n":"ผัดซีอิ๊วหมู","en":"Pad see ew pork","s":"1 จาน","g":320,"k":680,"p":24,"c":85,"f":26,"fb":2,"na":1500,"cat":"อาหารจานเดียว","u":true},
    {"n":"ผัดไทยกุ้ง","en":"Pad thai shrimp","s":"1 จาน","g":300,"k":600,"p":22,"c":80,"f":20,"fb":2,"na":1300,"cat":"อาหารจานเดียว","u":true},
    {"n":"ราดหน้าหมู","en":"Rad na pork","s":"1 จาน","g":400,"k":450,"p":20,"c":60,"f":14,"fb":3,"na":1500,"cat":"อาหารจานเดียว"},
    {"n":"ขนมจีนน้ำยา","en":"Rice noodle with fish curry","s":"1 จาน","g":350,"k":400,"p":15,"c":55,"f":13,"fb":3,"na":1200,"cat":"อาหารจานเดียว","u":true},
    {"n":"ก๋วยเตี๋ยวน้ำใสหมู","en":"Clear pork noodle soup","s":"1 ชาม","g":450,"k":350,"p":20,"c":45,"f":9,"fb":1,"na":1500,"cat":"ก๋วยเตี๋ยว"},
    {"n":"ก๋วยเตี๋ยวต้มยำหมู","en":"Tom yum noodle soup","s":"1 ชาม","g":450,"k":420,"p":22,"c":48,"f":15,"fb":1,"na":1700,"cat":"ก๋วยเตี๋ยว","u":true},
    {"n":"ก๋วยเตี๋ยวไก่ตุ๋น","en":"Braised chicken noodle soup","s":"1 ชาม","g":450,"k":380,"p":25,"c":45,"f":10,"fb":1,"na":1600,"cat":"ก๋วยเตี๋ยว"},
    {"n":"บะหมี่เกี๊ยวหมูแดง","en":"Egg noodle wonton BBQ pork","s":"1 ชาม","g":400,"k":400,"p":22,"c":50,"f":12,"fb":1,"na":1500,"cat":"ก๋วยเตี๋ยว"},
    {"n":"สุกี้น้ำไก่","en":"Suki soup chicken","s":"1 ชาม","g":500,"k":300,"p":25,"c":30,"f":8,"fb":3,"na":1800,"cat":"ก๋วยเตี๋ยว"},
    {"n":"สุกี้แห้งหมู","en":"Dry suki pork","s":"1 จาน","g":350,"k":450,"p":25,"c":45,"f":18,"fb":3,"na":1700,"cat":"ก๋วยเตี๋ยว","u":true},
    {"n":"โจ๊กหมู","en":"Rice porridge with pork","s":"1 ชาม","g":400,"k":250,"p":14,"c":35,"f":6,"fb":0.5,"na":900,"cat":"อาหารจานเดียว"},
    {"n":"ข้าวต้มปลา","en":"Rice soup with fish","s":"1 ชาม","g":400,"k":220,"p":18,"c":28,"f":4,"fb":0.5,"na":900,"cat":"อาหารจานเดียว"},
    {"n":"ส้มตำไทย","en":"Papaya salad (Thai)","s":"1 จาน","g":200,"k":150,"p":4,"c":28,"f":3,"fb":4,"na":1200,"cat":"กับข้าว"},
    {"n":"ส้มตำปูปลาร้า","en":"Papaya salad with crab & fermented fish","s":"1 จาน","g":200,"k":130,"p":5,"c":22,"f":3,"fb":4,"na":1800,"cat":"กับข้าว"},
    {"n":"ไก่ย่าง","en":"Grilled chicken","s":"1 ชิ้น (น่อง)","g":100,"k":200,"p":25,"c":3,"f":10,"fb":0,"na":450,"cat":"กับข้าว"},
    {"n":"หมูปิ้ง","en":"Grilled pork skewer","s":"1 ไม้","g":35,"k":90,"p":7,"c":4,"f":5,"fb":0,"na":250,"cat":"กับข้าว","u":true},
    {"n":"ไก่ทอด","en":"Fried chicken thigh","s":"1 ชิ้น (สะโพก)","g":130,"k":360,"p":24,"c":12,"f":24,"fb":0,"na":700,"cat":"กับข้าว","u":true},
    {"n":"ต้มยำกุ้งน้ำใส","en":"Tom yum goong (clear)","s":"1 ถ้วย","g":300,"k":120,"p":15,"c":8,"f":3,"fb":1,"na":1200,"cat":"กับข้าว"},
    {"n":"ต้มยำกุ้งน้ำข้น","en":"Tom yum goong (creamy)","s":"1 ถ้วย","g":300,"k":260,"p":15,"c":10,"f":18,"fb":1,"na":1200,"cat":"กับข้าว","u":true},
    {"n":"แกงเขียวหวานไก่","en":"Green curry chicken","s":"1 ถ้วย","g":250,"k":350,"p":20,"c":12,"f":25,"fb":2,"na":1100,"cat":"กับข้าว","u":true},
    {"n":"แกงส้ม","en":"Sour curry","s":"1 ถ้วย","g":300,"k":120,"p":12,"c":12,"f":2,"fb":3,"na":1300,"cat":"กับข้าว"},
    {"n":"แกงจืดเต้าหู้หมูสับ","en":"Clear soup tofu minced pork","s":"1 ถ้วย","g":300,"k":150,"p":14,"c":6,"f":8,"fb":1,"na":900,"cat":"กับข้าว"},
    {"n":"ยำวุ้นเส้น","en":"Glass noodle salad","s":"1 จาน","g":250,"k":250,"p":15,"c":30,"f":7,"fb":2,"na":1100,"cat":"กับข้าว"},
    {"n":"ยำทะเล","en":"Spicy seafood salad","s":"1 จาน","g":250,"k":200,"p":22,"c":12,"f":6,"fb":2,"na":1100,"cat":"กับข้าว"},
    {"n":"ลาบหมู","en":"Larb pork","s":"1 จาน","g":200,"k":250,"p":22,"c":8,"f":14,"fb":2,"na":900,"cat":"กับข้าว"},
    {"n":"ปาท่องโก๋","en":"Chinese fried dough","s":"1 คู่","g":35,"k":150,"p":3,"c":17,"f":8,"fb":0.5,"na":200,"cat":"ของว่าง","u":true},
    {"n":"อกไก่ต้ม","en":"Boiled chicken breast","s":"100 g","g":100,"k":165,"p":31,"c":0,"f":3.6,"fb":0,"na":75,"cat":"โปรตีน","fav":true},
    {"n":"อกไก่อบ/ย่าง","en":"Grilled chicken breast","s":"100 g","g":100,"k":170,"p":31,"c":0,"f":4.5,"fb":0,"na":300,"cat":"โปรตีน"},
    {"n":"อกไก่พร้อมทาน","en":"Ready-to-eat chicken breast","s":"1 ซอง","g":100,"k":120,"p":23,"c":2,"f":2,"fb":0,"na":500,"cat":"โปรตีน"},
    {"n":"ไข่ต้ม","en":"Boiled egg","s":"1 ฟอง","g":50,"k":72,"p":6.3,"c":0.4,"f":4.8,"fb":0,"na":62,"cat":"โปรตีน","fav":true},
    {"n":"ไข่ขาวต้ม","en":"Boiled egg white","s":"1 ฟอง","g":33,"k":17,"p":3.6,"c":0.2,"f":0,"fb":0,"na":55,"cat":"โปรตีน"},
    {"n":"ปลาแซลมอนย่าง","en":"Grilled salmon","s":"100 g","g":100,"k":208,"p":22,"c":0,"f":13,"fb":0,"na":60,"cat":"โปรตีน"},
    {"n":"ปลานิลนึ่ง","en":"Steamed tilapia","s":"100 g","g":100,"k":130,"p":26,"c":0,"f":2.7,"fb":0,"na":60,"cat":"โปรตีน"},
    {"n":"กุ้งต้ม","en":"Boiled shrimp","s":"100 g","g":100,"k":99,"p":24,"c":0.2,"f":0.3,"fb":0,"na":110,"cat":"โปรตีน"},
    {"n":"หมูสันในสุก","en":"Pork tenderloin, cooked","s":"100 g","g":100,"k":140,"p":26,"c":0,"f":3.5,"fb":0,"na":55,"cat":"โปรตีน"},
    {"n":"เนื้อวัวสันในสุก","en":"Beef tenderloin, cooked","s":"100 g","g":100,"k":200,"p":28,"c":0,"f":9,"fb":0,"na":60,"cat":"โปรตีน"},
    {"n":"เต้าหู้แข็ง","en":"Firm tofu","s":"100 g","g":100,"k":145,"p":15,"c":3,"f":9,"fb":2,"na":10,"cat":"โปรตีน"},
    {"n":"เต้าหู้ไข่","en":"Egg tofu","s":"1 หลอด","g":120,"k":90,"p":7,"c":3,"f":5,"fb":0,"na":300,"cat":"โปรตีน"},
    {"n":"ทูน่ากระป๋องในน้ำแร่","en":"Canned tuna in water","s":"1 กระป๋อง (สะเด็ดน้ำ)","g":80,"k":90,"p":20,"c":0,"f":1,"fb":0,"na":250,"cat":"โปรตีน"},
    {"n":"Whey protein","en":"Whey protein","s":"1 scoop","g":30,"k":120,"p":24,"c":3,"f":1.5,"fb":0,"na":60,"cat":"โปรตีน","fav":true},
    {"n":"นมจืด","en":"Whole milk","s":"1 กล่อง 200 ml","g":200,"k":130,"p":6.4,"c":9.6,"f":7.4,"fb":0,"na":100,"cat":"นม/เครื่องดื่ม"},
    {"n":"นมจืดพร่องมันเนย","en":"Low-fat milk","s":"1 กล่อง 200 ml","g":200,"k":90,"p":7,"c":10,"f":2,"fb":0,"na":110,"cat":"นม/เครื่องดื่ม"},
    {"n":"นมถั่วเหลืองหวานน้อย","en":"Soy milk, less sugar","s":"1 กล่อง 250 ml","g":250,"k":120,"p":7,"c":12,"f":5,"fb":1,"na":80,"cat":"นม/เครื่องดื่ม"},
    {"n":"กรีกโยเกิร์ตไม่มีน้ำตาล","en":"Plain Greek yogurt","s":"1 ถ้วย","g":150,"k":110,"p":15,"c":6,"f":2.5,"fb":0,"na":55,"cat":"นม/เครื่องดื่ม"},
    {"n":"โยเกิร์ตรสธรรมชาติ","en":"Plain yogurt","s":"1 ถ้วย","g":135,"k":90,"p":5,"c":10,"f":3,"fb":0,"na":70,"cat":"นม/เครื่องดื่ม"},
    {"n":"กาแฟดำ","en":"Black coffee / Americano","s":"1 แก้ว","g":350,"k":10,"p":0.5,"c":1,"f":0,"fb":0,"na":10,"cat":"นม/เครื่องดื่ม"},
    {"n":"ลาเต้ (นมสด)","en":"Latte","s":"1 แก้ว 16 oz","g":450,"k":190,"p":10,"c":16,"f":9,"fb":0,"na":150,"cat":"นม/เครื่องดื่ม"},
    {"n":"กาแฟเย็น","en":"Thai iced coffee","s":"1 แก้ว","g":400,"k":250,"p":4,"c":40,"f":8,"fb":0,"na":100,"cat":"นม/เครื่องดื่ม","u":true},
    {"n":"ชาไทยเย็น","en":"Thai iced tea","s":"1 แก้ว","g":400,"k":300,"p":4,"c":50,"f":9,"fb":0,"na":100,"cat":"นม/เครื่องดื่ม","u":true},
    {"n":"ชาเขียวนมเย็น","en":"Iced green milk tea","s":"1 แก้ว","g":400,"k":280,"p":4,"c":46,"f":8,"fb":0,"na":100,"cat":"นม/เครื่องดื่ม","u":true},
    {"n":"น้ำอัดลม","en":"Soft drink","s":"1 กระป๋อง 325 ml","g":325,"k":140,"p":0,"c":35,"f":0,"fb":0,"na":30,"cat":"นม/เครื่องดื่ม"},
    {"n":"น้ำอัดลมไม่มีน้ำตาล","en":"Diet soft drink","s":"1 กระป๋อง 325 ml","g":325,"k":1,"p":0,"c":0,"f":0,"fb":0,"na":30,"cat":"นม/เครื่องดื่ม"},
    {"n":"เบียร์","en":"Beer (can)","s":"1 กระป๋อง 330 ml","g":330,"k":145,"p":1.5,"c":11,"f":0,"fb":0,"na":15,"cat":"นม/เครื่องดื่ม"},
    {"n":"เบียร์ (ขวดใหญ่)","en":"Beer (large bottle)","s":"1 ขวด 620 ml","g":620,"k":270,"p":2.8,"c":21,"f":0,"fb":0,"na":25,"cat":"นม/เครื่องดื่ม"},
    {"n":"น้ำส้มคั้น","en":"Fresh orange juice","s":"1 แก้ว 250 ml","g":250,"k":110,"p":1.7,"c":26,"f":0.5,"fb":0.5,"na":2,"cat":"นม/เครื่องดื่ม"},
    {"n":"กล้วยหอม","en":"Banana (Cavendish)","s":"1 ผล","g":120,"k":105,"p":1.3,"c":27,"f":0.4,"fb":3,"na":1,"cat":"ผลไม้"},
    {"n":"กล้วยน้ำว้า","en":"Banana (Namwa)","s":"1 ผล","g":60,"k":60,"p":0.7,"c":15,"f":0.2,"fb":1.5,"na":1,"cat":"ผลไม้"},
    {"n":"มะม่วงสุก","en":"Ripe mango","s":"1/2 ผล","g":150,"k":90,"p":1.2,"c":23,"f":0.6,"fb":2.4,"na":2,"cat":"ผลไม้"},
    {"n":"แอปเปิ้ล","en":"Apple","s":"1 ผล","g":180,"k":95,"p":0.5,"c":25,"f":0.3,"fb":4,"na":2,"cat":"ผลไม้"},
    {"n":"ฝรั่ง","en":"Guava","s":"1/2 ผล","g":150,"k":100,"p":3.8,"c":21,"f":1.4,"fb":8,"na":3,"cat":"ผลไม้"},
    {"n":"ส้ม","en":"Orange","s":"1 ผล","g":130,"k":60,"p":1.2,"c":15,"f":0.2,"fb":3,"na":0,"cat":"ผลไม้"},
    {"n":"แตงโม","en":"Watermelon","s":"1 ชิ้น","g":200,"k":60,"p":1.2,"c":15,"f":0.3,"fb":0.8,"na":2,"cat":"ผลไม้"},
    {"n":"ผักลวกรวม","en":"Blanched mixed vegetables","s":"1 ถ้วย","g":150,"k":40,"p":2.5,"c":7,"f":0.3,"fb":3,"na":30,"cat":"ผัก"},
    {"n":"สลัดผัก (ไม่ใส่น้ำสลัด)","en":"Green salad, no dressing","s":"1 จาน","g":150,"k":30,"p":2,"c":5,"f":0.3,"fb":2.5,"na":30,"cat":"ผัก"},
    {"n":"บรอกโคลีลวก","en":"Blanched broccoli","s":"100 g","g":100,"k":35,"p":2.8,"c":7,"f":0.4,"fb":3.3,"na":40,"cat":"ผัก"},
    {"n":"อัลมอนด์","en":"Almonds","s":"1 กำมือ","g":28,"k":165,"p":6,"c":6,"f":14,"fb":3.5,"na":0,"cat":"ถั่ว/ของว่าง"},
    {"n":"ถั่วลิสงอบ","en":"Roasted peanuts","s":"30 g","g":30,"k":170,"p":7.5,"c":5,"f":14,"fb":2.5,"na":120,"cat":"ถั่ว/ของว่าง"},
    {"n":"เนยถั่ว","en":"Peanut butter","s":"1 ช้อนโต๊ะ","g":16,"k":95,"p":3.5,"c":3,"f":8,"fb":1,"na":70,"cat":"ถั่ว/ของว่าง"},
    {"n":"อกไก่ดิบ","en":"Raw chicken breast","s":"100 g","g":100,"k":120,"p":23,"c":0,"f":2.6,"fb":0,"na":45,"cat":"วัตถุดิบ"},
    {"n":"หมูสับดิบ","en":"Raw minced pork","s":"100 g","g":100,"k":263,"p":17,"c":0,"f":21,"fb":0,"na":55,"cat":"วัตถุดิบ"},
    {"n":"ข้าวหอมมะลิดิบ","en":"Uncooked jasmine rice","s":"100 g","g":100,"k":350,"p":7,"c":78,"f":0.6,"fb":1,"na":5,"cat":"วัตถุดิบ"},
    {"n":"ข้าวกล้องดิบ","en":"Uncooked brown rice","s":"100 g","g":100,"k":360,"p":7.5,"c":76,"f":2.7,"fb":3.5,"na":5,"cat":"วัตถุดิบ"},
    {"n":"ไข่ไก่ดิบ","en":"Raw egg","s":"1 ฟอง","g":50,"k":72,"p":6.3,"c":0.4,"f":4.8,"fb":0,"na":70,"cat":"วัตถุดิบ"},
    {"n":"น้ำมันพืช","en":"Vegetable oil","s":"1 ช้อนโต๊ะ","g":14,"k":120,"p":0,"c":0,"f":14,"fb":0,"na":0,"cat":"วัตถุดิบ"},
    {"n":"ซีอิ๊วขาว","en":"Light soy sauce","s":"1 ช้อนโต๊ะ","g":15,"k":10,"p":1,"c":1,"f":0,"fb":0,"na":900,"cat":"วัตถุดิบ"}
  ]$foods$::jsonb) as x;
  return true;
end $$;

revoke all on function public.seed_foods(uuid) from public, anon;
grant execute on function public.seed_foods(uuid) to authenticated;

create or replace function public.on_settings_created_foods()
returns trigger language plpgsql set search_path = public as $$
begin
  perform public.seed_foods(new.user_id);
  return new;
end $$;
create trigger settings_seed_foods after insert on public.settings
  for each row execute function public.on_settings_created_foods();

-- ผู้ใช้เดิม
select public.seed_foods(user_id) from public.settings;
