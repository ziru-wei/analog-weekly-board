/**
 * Feedback for Enter-copy: each copied paper is pressed into the cork and springs back. Its shadow tightens and its
 * face darkens for a moment, then both recover with a slight overshoot.
 */
export function pressItems(elements: HTMLElement[]) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const element of elements) {
    const resting = element.style.transform || 'none', shadow = getComputedStyle(element).boxShadow;
    element.animate([
      { transform: resting, filter: 'brightness(1)', boxShadow: shadow, easing: 'cubic-bezier(.5, 0, .9, .6)' },
      { transform: `${resting} translateY(1.5px) scale(.975)`, filter: 'brightness(.9)', boxShadow: '0 .5px .5px #28140866', offset: .3, easing: 'cubic-bezier(.25, 1.7, .5, 1)' },
      { transform: resting, filter: 'brightness(1)', boxShadow: shadow },
    ], { duration: 340 });
    // Photos and website cards cast their lift shadow from ::before.
    element.animate([{ opacity: 1 }, { opacity: .3, offset: .3 }, { opacity: 1 }], { duration: 340, pseudoElement: '::before' });
  }
}
