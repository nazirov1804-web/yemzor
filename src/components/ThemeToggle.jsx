import { useEffect, useId, useRef, useState } from "react";
import { FiChevronDown, FiMoon, FiSun } from "react-icons/fi";
import { observeTranslations } from "../i18n";

export default function ThemeToggle({
  theme,
  onToggle,
  showLanguagePicker = true,
}) {
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
    { value: "uz", label: "O‘zbekcha", flag: "🇺🇿" },
    { value: "ru", label: "Русский", flag: "🇷🇺" },
    { value: "en", label: "English", flag: "🇺🇸" },
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
  const selectedLanguage = languageOptions.find(
    (option) => option.value === language,
  ) || languageOptions[0];

  return (
    <div className="theme-controls">
      {showLanguagePicker && (
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
            <span className="language-flag" aria-hidden="true">
              {selectedLanguage.flag}
            </span>
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
                  <span className="language-flag" aria-hidden="true">
                    {option.flag}
                  </span>
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
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
