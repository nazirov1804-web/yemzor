import { FiArrowLeft, FiShield } from "react-icons/fi";
import ThemeToggle from "../components/ThemeToggle";
import { translateText } from "../i18n";

const currentLanguage = () => {
  const language = document.documentElement.lang;
  return language === "ru" || language === "en" ? language : "uz";
};

export default function LegalPageLayout({
  title,
  subtitle,
  updatedAt,
  sections,
  onBack,
  theme,
  onToggleTheme,
}) {
  const language = currentLanguage();
  return (
    <main className="legal-page">
      <header className="legal-page-header">
        <button className="legal-back-button" type="button" onClick={onBack}>
          <FiArrowLeft /> {translateText("Qaytish", language)}
        </button>
        <a href="#" className="brand">
          <img className="brand-symbol" src="/yemzor-logo.png" alt="" />
          <span>
            <strong>Yemzor</strong>
            <small>
              {translateText("SAVDO VA OMBOR BOSHQARUVI", language)}
            </small>
          </span>
        </a>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>
      <article className="legal-page-content">
        <div className="legal-page-title">
          <span className="legal-page-icon">
            <FiShield />
          </span>
          <span className="landing-kicker">
            <i /> {translateText("YEMZOR HUJJATLARI", language)}
          </span>
          <h1>{translateText(title, language)}</h1>
          <p>{translateText(subtitle, language)}</p>
          <small>
            {translateText("Oxirgi yangilanish", language)}:{" "}
            {translateText(updatedAt, language)}
          </small>
        </div>
        <div className="legal-page-sections">
          {sections.map((section, index) => (
            <section className="legal-page-section" key={section.title}>
              <span className="legal-section-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h2>{translateText(section.title, language)}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{translateText(paragraph, language)}</p>
                ))}
                {section.items && (
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{translateText(item, language)}</li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ))}
        </div>
      </article>
      <footer className="legal-page-footer">
        <span>© Yemzor</span>
        <span>
          {translateText("Do‘kon savdosi va ombor boshqaruvi", language)}
        </span>
      </footer>
    </main>
  );
}
