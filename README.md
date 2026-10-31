# Yemzor

Yem mahsulotlari do‘koni uchun savdo, umumiy ombor, cheklar, hodimlar va oylik hisob tizimi.

## Ishga tushirish

1. Node.js 20 yoki undan yangisini o‘rnating.
2. Loyiha papkasida `npm install` buyrug‘ini bajaring.
3. `npm run dev:all` buyrug‘i bilan API va Vite’ni ishga tushiring.
4. Terminal ko‘rsatgan Vite manzilini oching. Birinchi kirishda platforma egasining login va parolini o‘zingiz yarating.
5. Platforma panelidan do‘kon yarating. Boshliq login-parolini do‘kon egasiga bering; boshliq o‘z panelidan har bir hodim uchun alohida login ochadi.

Demo uchun tasdiqlash kodi emailga yuborilishi uchun `.env.example` faylidan `.env` yarating va `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` qiymatlarini email xizmat ko‘rsatuvchingiz ma’lumotlari bilan to‘ldiring. SMTP sozlanmagan yoki jo‘natishda xato bo‘lsa, tasdiqlash kodi ko‘rsatilmaydi va server xatolik qaytaradi. Kod email manzili uchun 10 daqiqa amal qiladi.

## Windows va Android ilovalari

Native ilovalar `capacitor.config.json` va `electron/main.cjs` ichidagi `https://yemzor.duckdns.org` manziliga ulanadi. Ilova ochilganda landing emas, login oynasi ko‘rinadi. Domenni DuckDNS’da serveringizning ommaviy IP manziliga yo‘naltiring, VPS yoki doimiy ishlaydigan serverga frontend va API’ni joylang, HTTPS sertifikatini yoqing. Login va oylik obunani tekshirish uchun internet kerak.

Yuklab olingan Android va Windows ilovalaridagi tovarlar, kirimlar, cheklar, savdolar, davomat va boshqa ish ma’lumotlari shu qurilmaning IndexedDB xotirasida saqlanadi. Ular serverdagi eski ma’lumotlarni yuklamaydi va boshqa qurilma yoki brauzer bilan sinxronlanmaydi. Qurilma/browser ma’lumotlari o‘chirilsa, mahalliy yozuvlar yo‘qolishi mumkin; hozircha avtomatik zaxira va qurilmalararo ko‘chirish yo‘q. Login va parol xeshlari hamda obuna holati serverda qoladi. Oddiy brauzerdagi web ilova esa server ma’lumotlar bazasi bilan ishlashda davom etadi.

- Windows o‘rnatuvchisi: Windows kompyuterda `npm run desktop:win`; natija `release/` ichidagi Yemzor Setup `.exe` fayli.
- Android APK: Android Studio, JDK va Android SDK o‘rnatilgan kompyuterda `npm run android:apk`; natija `release/Yemzor.apk`. Android platformasi hali yaratilmagan bo‘lsa, avval `npm run android:init` bajaring. Hozirgi APK sinov (debug) build bo‘ladi, Play Store uchun imzolanmagan.

Yemzor sayti serverga joylanmaguncha native ilovada login qilish imkoni bo‘lmaydi. Windows `.exe` faylini Linux muhitida yaratish uchun Windows yoki Wine kerak; Android build uchun Java va Android SDK talab qilinadi.

## Imkoniyatlar

- Har bir do‘konning tovari, savdosi, hodimi, cheki va kirimlari `companyId` bilan alohida ajratiladi. Platforma egasi do‘kon yaratadi; boshliq va hodimlar faqat o‘z do‘konida ishlaydi.
- Hodimga berilgan login takrorlanmaydi. Web ilovada ombor va savdo tarixi serverda saqlanib, akkauntlar orasida yangilanadi. Yuklangan ilovalarda esa ish yozuvlari faqat shu qurilmada qoladi.
- Qopdagi qoldiq qopda, vaznli mahsulot qoldig‘i kilogrammda yuritiladi. Vaznli kirimda kg yoki tonna tanlanadi.
- Har bir mahsulot uchun sotuv narxi va eng past narx belgilanadi. Sotuvdagi narx eng past narxdan qat’iy yuqori va asosiy sotuv narxidan oshmagan bo‘lishi serverda tekshiriladi.
- Sana, hafta va oy tushumi; oylik kirim/sotuv qiymati; chek raqami bo‘yicha qidirish; chop etiladigan chek.
- Kirimning kunlik, haftalik va oylik jami hamda har bir mahsulot qachon kelgani sana-vaqti bilan saqlanadi va hisobotda ko‘rsatiladi.
- Hodim oyligi, oylikdan ayriladigan avans va sana bilan kunma-kun qayd etilib jami yig‘iladigan, oylikdan ayrilmaydigan Abed puli alohida yuritiladi.
- Boshliq har bir hodimni tanlangan sanada kelgan yoki kelmagan deb belgilaydi. Hodim chiqarilganda akkaunti, davomat, avans va Abed yozuvlari o‘chadi; uning eski savdo va cheklari saqlanadi.
- Platforma egasi har bir kompaniya uchun tarifni oyma-oy alohida belgilaydi. Joriy oy tarifi uchun yetarli to‘lov tasdiqlanmaguncha, do‘konning savdosi va boshqa amallari bloklanadi. Qabul qilingan haqiqiy to‘lovlar tarixda yoziladi; ortiqcha qismi balans bo‘lib keyingi oylarning tarifiga ketma-ket hisoblanadi. To‘lov qo‘lda tasdiqlanadi; avtomatik yoki onlayn pul o‘tkazish integratsiyasi mavjud emas.
- Ommaviy landing sahifada `@naziroff1` Telegram manzili bor. Platforma egasi admin panelidan telefon raqamini sozlab, landing sahifada ko‘rsatishi mumkin.
- Landing sahifadagi brendlar soni, tasdiqlangan cheklar va joriy to‘lovli faol brendlarning uchtagacha nomi bazadan olinib har 10 soniyada yangilanadi.
- Landing sahifada demo uchun ro‘yxatdan o‘tganlar jami ko‘rinadi; son `database.json`da saqlanadi va muddati tugagan demo hisoblari ham ro‘yxatda qoladi. Demo email va parol bilan bir marta ro‘yxatdan o‘tiladi, alohida do‘konda 48 soat ishlaydi. Muddat tugagach kirish yopiladi; demo do‘konlar brend va cheklarning ommaviy statistikasiga kiritilmaydi.
- Do‘kon boshlig‘i login va parolini “Hisob sozlamalari” bo‘limidan yangilaydi. Yangi parol ochiq matn ko‘rinishida emas, bcrypt xeshi sifatida saqlanadi; foydalanuvchining oxirgi ochgan sahifasi brauzer yangilangandan keyin tiklanadi.
- Platforma egasi do‘konni butunlay o‘chirishi mumkin; bu amal barcha kompaniya ma’lumotlari va to‘lov tarixini o‘chiradi.

## Ma’lumotlar va xavfsizlik

`database.json` birinchi server ishga tushganda yaratiladi va `.gitignore` orqali Git’ga qo‘shilmaydi. Web ilovaning yozuvlari va akkaunt/obuna ma’lumotlari shu server bazasida qoladi; native ilovalarning yangi ish yozuvlari u yerga yuborilmaydi. Zaxira nusxalarini xavfsiz joyda saqlang.

Parollar bcrypt xeshi sifatida saqlanadi. Brauzer sessiyasi `HttpOnly`, `SameSite=Lax` cookie bilan boshqariladi; tizimni hammaga ochiq serverga joylashtirishdan oldin `SESSION_SECRET`, HTTPS va xavfsiz operatsion muhitni sozlang. Birinchi platforma egasi akkauntini yaratish sahifasi faqat egasi hali yo‘q bo‘lganda ko‘rinadi.
