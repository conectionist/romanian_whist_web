// The restart banner stays up for as long as the connection does, so what opens under it starts below it: the sheet
// layer takes its top from --banner-room, which is how far the banner reaches below the menu bar.
export class BannerRoom {
  private readonly watcher: ResizeObserver;

  constructor(
    private readonly frame: HTMLElement,
    private readonly notices: HTMLElement,
  ) {
    // The banner wraps by the window's width, so it is measured again when either changes.
    this.watcher = new ResizeObserver(() => this.update());
    this.watcher.observe(notices);
    this.watcher.observe(frame);
  }

  update(): void {
    const banner = this.notices.querySelector<HTMLElement>('[data-notice="restart"]');
    if (banner === null) {
      this.frame.style.removeProperty("--banner-room");
      return;
    }
    const band = parseFloat(getComputedStyle(this.frame).getPropertyValue("--band")) || 0;
    const reach = banner.getBoundingClientRect().bottom - this.frame.getBoundingClientRect().top;
    this.frame.style.setProperty("--banner-room", `${Math.max(0, Math.ceil(reach - band)) + 6}px`);
  }
}
