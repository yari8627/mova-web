"use client";

import { useEffect } from "react";

export function ModalScrollLock() {
  useEffect(() => {
    let locked = false;
    let previousOverflow = "";
    let previousPaddingRight = "";

    const update = () => {
      const hasOpenModal = Boolean(document.querySelector(".modal-backdrop"));
      if (hasOpenModal && !locked) {
        previousOverflow = document.body.style.overflow;
        previousPaddingRight = document.body.style.paddingRight;
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        document.body.style.overflow = "hidden";
        if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
        locked = true;
      } else if (!hasOpenModal && locked) {
        document.body.style.overflow = previousOverflow;
        document.body.style.paddingRight = previousPaddingRight;
        locked = false;
      }
    };

    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    update();
    return () => {
      observer.disconnect();
      if (locked) {
        document.body.style.overflow = previousOverflow;
        document.body.style.paddingRight = previousPaddingRight;
      }
    };
  }, []);

  return null;
}
