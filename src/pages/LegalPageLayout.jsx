import { FiArrowLeft, FiShield } from "react-icons/fi";
import ThemeToggle from "../components/ThemeToggle";

export default function LegalPageLayout({
  title,
  subtitle,
  updatedAt,
  sections,
  onBack,
  theme,
  onToggleTheme,
}) {
  return (
    <main className="legal-page">
      <header className="legal-page-header">
        <button className="legal-back-button" type="button" onClick={onBack}>
          <FiArrowLeft /> Qaytish
        </button>
        <a href="#" className="brand">
          <img className="brand-symbol" src="/yemzor-logo.png" alt="" />
          <span>
            <strong>Yemzor</strong>
            <small>SAVDO VA OMBOR BOSHQARUVI</small>
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
            <i /> HISOBLI HUJJATLARI
          </span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
          <small>Oxirgi yangilanish: {updatedAt}</small>
        </div>
        <div className="legal-page-sections">
          {sections.map((section, index) => (
            <section className="legal-page-section" key={section.title}>
              <span className="legal-section-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h2>{section.title}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.items && (
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
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
        <span>Do‘kon savdosi va ombor boshqaruvi</span>
      </footer>
    </main>
  );
}
