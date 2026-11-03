import { useEffect, useId, useRef, useState } from "react";
import { FiChevronDown, FiGlobe, FiMoon, FiSun } from "react-icons/fi";
import { observeTranslations } from "../i18n";

export default function ThemeToggle({ theme, onToggle }) {
  const dark = theme === "dark";
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [language, setLanguage] = useState(
    () => window.localStorage.getItem("yemzor:language") || "uz",
  );
  const languageMenuId = useId();
  const languagePickerRef = useRef(null);
  const languageButtonRef = useRef(null);
  const languageLabels = { uz: "Uz", ru: "Ru", en: "Eng" };
  const languageOptions = [
    { value: "uz", label: "O‘zbekcha" },
    { value: "ru", label: "Русский" },
    { value: "en", label: "English" },
  ];

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

  useEffect(() => {
    if (!languageMenuOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!languagePickerRef.current?.contains(event.target)) {
        setLanguageMenuOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setLanguageMenuOpen(false);
        languageButtonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [languageMenuOpen]);

  const selectLanguage = (selectedLanguage) => {
    document.documentElement.lang = selectedLanguage;
    window.localStorage.setItem("yemzor:language", selectedLanguage);
    setLanguage(selectedLanguage);
    setLanguageMenuOpen(false);
    window.dispatchEvent(new Event("yemzor:language-change"));
  };
  const languageLabel =
    language === "ru"
      ? "Язык сайта"
      : language === "en"
        ? "Website language"
        : "Sayt tili";

  return (
    <div className="theme-controls">
      <div
        className="language-picker"
        data-language-picker
        ref={languagePickerRef}
      >
        <button
          ref={languageButtonRef}
          className="language-picker-trigger"
          type="button"
          aria-label={languageLabel}
          aria-expanded={languageMenuOpen}
          aria-controls={languageMenuOpen ? languageMenuId : undefined}
          onClick={() => setLanguageMenuOpen((open) => !open)}
        >
          <FiGlobe aria-hidden="true" />
          <span>{languageLabels[language] || "Uz"}</span>
          <FiChevronDown
            className="language-picker-chevron"
            aria-hidden="true"
          />
        </button>
        {languageMenuOpen && (
          <div
            className="language-picker-menu"
            id={languageMenuId}
            role="group"
            aria-label={languageLabel}
          >
            {languageOptions.map((option) => (
              <button
                className={`language-picker-option${language === option.value ? " selected" : ""}`}
                key={option.value}
                type="button"
                aria-pressed={language === option.value}
                onClick={() => selectLanguage(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
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
