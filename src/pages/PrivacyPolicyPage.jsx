import LegalPageLayout from "./LegalPageLayout";

const sections = [
  {
    title: "Qanday ma’lumotlar saqlanadi",
    paragraphs: [
      "Yemzor xizmatidan foydalanish davomida akkaunt egasi va xodimlarning ism-sharifi, login ma’lumotlari hamda foydalanuvchi kiritgan do‘kon ma’lumotlari qayta ishlanishi mumkin.",
      "Do‘kon ma’lumotlariga mahsulotlar, narxlar, kirimlar, savdolar, cheklar, davomat va ish haqi yozuvlari kiradi.",
    ],
  },
  {
    title: "Ma’lumotlardan foydalanish maqsadi",
    paragraphs: [
      "Ma’lumotlar xizmatning asosiy funksiyalarini taqdim etish va foydalanuvchi akkauntini boshqarish uchungina ishlatiladi. Xususan, ular quyidagi imkoniyatlarga xizmat qiladi:",
    ],
    items: [
      "Ombor qoldig‘i, mahsulot kirimi va savdo hisobini yuritish.",
      "Cheklarni, davrlar bo‘yicha hisobotlarni va xodimlar hisobini ko‘rsatish.",
      "Akkaunt xavfsizligini ta’minlash hamda foydalanuvchi murojaatlariga javob berish.",
    ],
  },
  {
    title: "Ma’lumotlarni saqlash va himoya qilish",
    paragraphs: [
      "Ma’lumotlarni ruxsatsiz kirish, o‘zgartirish yoki yo‘qotishdan himoya qilish uchun tegishli texnik va tashkiliy choralar qo‘llanadi. Biroq internet orqali uzatish yoki elektron saqlashning hech bir usuli mutlaq xavfsizlikni kafolatlamaydi.",
      "Foydalanuvchi o‘z parolini maxfiy saqlashi va shubhali kirish holatlarini darhol xabar qilishi kerak.",
    ],
  },
  {
    title: "Ma’lumotlarni ulashish",
    paragraphs: [
      "Shaxsiy ma’lumotlar reklama maqsadida sotilmaydi. Ma’lumotlar xizmatni ishlatish, foydalanuvchi so‘roviga javob berish yoki qonuniy majburiyatlarni bajarish uchun zarur bo‘lgan holatlardagina tegishli doirada ko‘rib chiqilishi mumkin.",
      "Akkaunt egasi do‘koniga xodimlarni qo‘shish orqali ularga tegishli panel va ma’lumotlarga kirish huquqini beradi. Bunday huquqlarni belgilash akkaunt egasining mas’uliyatida bo‘ladi.",
    ],
  },
  {
    title: "Foydalanuvchi huquqlari va ma’lumotlar",
    paragraphs: [
      "Akkaunt egasi o‘z akkaunti va do‘kon ma’lumotlarini boshqarishi, xato ma’lumotlarni tuzatishi yoki xizmat bo‘yicha savol bilan murojaat qilishi mumkin.",
      "Akkauntni o‘chirish yoki ma’lumotlarni saqlash muddatiga oid so‘rovlar Yemzor bilan aloqa kanallari orqali yuboriladi. Qonuniy talablar yoki xavfsizlik zarurati bo‘lgan holatlarda ayrim yozuvlar saqlanishi mumkin.",
    ],
  },
  {
    title: "Siyosatdagi yangilanishlar",
    paragraphs: [
      "Ushbu siyosat xizmatdagi o‘zgarishlar yoki qonuniy talablar sabab yangilanishi mumkin. Amaldagi matn shu sahifada e’lon qilinadi; yangilangan sana sahifaning yuqori qismida ko‘rsatiladi.",
    ],
  },
  {
    title: "Aloqa",
    paragraphs: [
      "Maxfiylik, akkaunt yoki ma’lumotlaringiz bo‘yicha savol va so‘rovlarni landing sahifasida ko‘rsatilgan Telegram yoki telefon orqali yuboring.",
    ],
  },
];

export default function PrivacyPolicyPage({ onBack, theme, onToggleTheme }) {
  return (
    <LegalPageLayout
      title="Maxfiylik siyosati"
      subtitle="Yemzor xizmatida ma’lumotlar qanday yig‘ilishi, ishlatilishi va himoyalanishi haqida."
      updatedAt="5-oktabr, 2026"
      sections={sections}
      onBack={onBack}
      theme={theme}
      onToggleTheme={onToggleTheme}
    />
  );
}
