import { type KeyboardEvent, useEffect, useState } from "react";

type Options = {
  itemCount: number;
  isOpen: boolean;
  resetKey: string;
  onOpen: () => void;
  onClose: () => void;
  onSelect: (index: number) => void;
};

export function useAutocompleteKeyboard({ itemCount, isOpen, resetKey, onOpen, onClose, onSelect }: Options) {
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => { setActiveIndex(-1); }, [resetKey, isOpen]);
  useEffect(() => { if (activeIndex >= itemCount) setActiveIndex(itemCount - 1); }, [activeIndex, itemCount]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      onOpen();
      if (itemCount) setActiveIndex((current) => current < itemCount - 1 ? current + 1 : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      onOpen();
      if (itemCount) setActiveIndex((current) => current > 0 ? current - 1 : itemCount - 1);
    } else if (event.key === "Enter" && isOpen && activeIndex >= 0) {
      event.preventDefault();
      onSelect(activeIndex);
      setActiveIndex(-1);
    } else if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      onClose();
      setActiveIndex(-1);
    }
  }

  return { activeIndex, setActiveIndex, onKeyDown };
}
