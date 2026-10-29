import LegalPageLayout from "./LegalPageLayout";

const sections = [
  {
    title: "Umumiy qoidalar",
    paragraphs: [
      "Ushbu ommaviy oferta Yemzor savdo va ombor boshqaruvi xizmatidan foydalanish shartlarini belgilaydi. Sayt yoki tizimdan foydalanishni boshlagan shaxs ushbu shartlarni o‘qib chiqqanini va ularga roziligini bildiradi.",
      "Yemzor do‘konlar uchun mahsulot kirimi, ombor qoldig‘i, savdo, chek, xodimlar va tegishli hisobotlarni yuritishga mo‘ljallangan dasturiy xizmatdir.",
    ],
  },
  {
    title: "Akkaunt va foydalanuvchi majburiyatlari",
    paragraphs: [
      "Akkaunt egasi o‘z tashkiloti va foydalanuvchilari uchun akkauntlarni boshqaradi. Har bir foydalanuvchi faqat o‘ziga berilgan login va parol orqali ishlashi kerak.",
    ],
    items: [
      "Ro‘yxatdan o‘tishda va tizimda kiritiladigan ma’lumotlarning to‘g‘riligini ta’minlash.",
      "Login va parollarni begonalarga bermaslik hamda akkauntdan amalga oshirilgan harakatlarni nazorat qilish.",
      "Tizimdan qonuniy maqsadlarda va belgilangan funksiyalar doirasida foydalanish.",
    ],
  },
  {
    title: "Ma’lumotlar va hisob-kitoblar",
    paragraphs: [
      "Mahsulotlar, narxlar, kirimlar, savdolar, cheklar, xodimlar va ish haqi bo‘yicha kiritilgan ma’lumotlar foydalanuvchining mas’uliyatida bo‘ladi. Tizim ko‘rsatgan hisoblar kiritilgan ma’lumotlarga asoslanadi; muhim moliyaviy yozuvlarni muntazam tekshirib borish tavsiya etiladi.",
      "Foydalanuvchi o‘zining muhim ma’lumotlari uchun zaxira nusxasini saqlashi va akkauntga kirish huquqlarini ehtiyotkorlik bilan taqsimlashi lozim.",
    ],
  },
  {
    title: "Demo, to‘lov va xizmatdan foydalanish",
    paragraphs: [
      "Demo rejimi xizmat imkoniyatlarini sinab ko‘rish uchun taqdim etiladi. Demo muddati, obuna va to‘lov shartlari foydalanuvchiga akkaunt yoki xizmat ichida ko‘rsatiladi.",
      "Xizmatning ayrim imkoniyatlari obuna holati yoki tanlangan foydalanish shartlariga bog‘liq bo‘lishi mumkin. To‘lovga oid savollar yuzasidan Yemzor aloqa kanallariga murojaat qilish mumkin.",
    ],
  },
  {
    title: "Xizmatdan foydalanishni cheklash",
    paragraphs: [
      "Xavfsizlik, texnik xizmat yoki qonuniy talablar sabab xizmat yoki ayrim funksiyalar vaqtincha cheklanishi mumkin. Yemzor xizmatning uzluksiz va xatosiz ishlashini kafolatlamaydi, ammo yuzaga kelgan muammolarni bartaraf etish uchun oqilona choralar ko‘radi.",
      "Ushbu oferta shartlariga o‘zgartirishlar kiritilsa, yangilangan matn ushbu sahifada e’lon qilinadi.",
    ],
  },
  {
    title: "Murojaat va aloqa",
    paragraphs: [
      "Oferta yoki xizmatdan foydalanish bo‘yicha savollar uchun landing sahifasidagi aloqa ma’lumotlari orqali Yemzor bilan bog‘laning.",
    ],
  },
];

export default function OfferPage({ onBack, theme, onToggleTheme }) {
  return (
    <LegalPageLayout
      title="Ommaviy oferta"
      subtitle="Yemzor xizmatidan foydalanish shartlari va foydalanuvchi majburiyatlari."
      updatedAt="5-oktabr, 2026"
      sections={sections}
      onBack={onBack}
      theme={theme}
      onToggleTheme={onToggleTheme}
    />
  );
}
