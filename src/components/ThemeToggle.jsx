import { useEffect, useState } from "react";
import { FiMoon, FiSun } from "react-icons/fi";
import { observeTranslations } from "../i18n";

export default function ThemeToggle({ theme, onToggle }) {
  const dark = theme === "dark";
  const [language, setLanguage] = useState(
    () => window.localStorage.getItem("yemzor:language") || "uz",
  );

  useEffect(() => {
    window.localStorage.setItem("yemzor:language", language);
    return observeTranslations(language);
  }, [language]);

  useEffect(() => {
    const syncLanguage = () => {
      setLanguage(window.localStorage.getItem("yemzor:language") || "uz");
    };
    window.addEventListener("yemzor:language-change", syncLanguage);
    return () => window.removeEventListener("yemzor:language-change", syncLanguage);
  }, []);

  return (
    <div className="theme-controls">
      <label className="language-picker" data-language-picker>
        <span className="sr-only">
          {language === "ru"
            ? "Язык сайта"
            : language === "en"
              ? "Website language"
              : "Sayt tili"}
        </span>
        <select
          aria-label={
            language === "ru"
              ? "Язык сайта"
              : language === "en"
                ? "Website language"
                : "Sayt tili"
          }
          value={language}
          onChange={(event) => {
            const selectedLanguage = event.target.value;
            document.documentElement.lang =
              selectedLanguage === "uz"
                ? "uz"
                : selectedLanguage === "ru"
                  ? "ru"
                  : "en";
            window.localStorage.setItem("yemzor:language", selectedLanguage);
            setLanguage(selectedLanguage);
            window.dispatchEvent(new Event("yemzor:language-change"));
          }}
        >
          <option value="uz">UZB</option>
          <option value="ru">RUS</option>
          <option value="en">ENG</option>
        </select>
      </label>
      <button
        className="theme-toggle"
        type="button"
        onClick={onToggle}
        aria-label={dark ? "Kun rejimiga o‘tish" : "Tun rejimiga o‘tish"}
        aria-pressed={dark}
        title={dark ? "Kun rejimi" : "Tun rejimi"}
      >
        {dark ? <FiSun /> : <FiMoon />}
        <span>{dark ? "Kun rejimi" : "Tun rejimi"}</span>
      </button>
    </div>
  );
}
