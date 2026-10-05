"use client";

import { useEffect } from "react";

// Observa todo elemento com atributo data-reveal e adiciona a classe
// "is-visible" na primeira vez que ele entra na tela — some observa uma vez
// e desliga (unobserve), não fica reavaliando o scroll inteiro pra sempre.
// CSS correspondente (land-reveal / is-visible) fica no <style> do próprio
// LandingPage.tsx.
export function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!("IntersectionObserver" in window) || els.length === 0) {
      els.forEach(el => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}
