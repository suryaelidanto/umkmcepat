export const MOTION_PRESET_CSS = `
/* Authored motion preset. Keyframes only: content stays visible without
   JavaScript, and reduced-motion users get the static composition. */
@keyframes umkm-rise-in {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes umkm-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.umkm-motion {
  animation: umkm-rise-in 500ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.umkm-motion-soft {
  animation: umkm-fade-in 400ms ease-out both;
}

@media (prefers-reduced-motion: reduce) {
  .umkm-motion,
  .umkm-motion-soft {
    animation: none !important;
    transition: none !important;
  }
}
`;
