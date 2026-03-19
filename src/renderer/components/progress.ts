export interface ProgressBar {
  element: HTMLElement;
  update: (pct: number, label: string) => void;
  setIndeterminate: (label: string) => void;
  hide: () => void;
}

export function createProgressBar(): ProgressBar {
  const wrapper = document.createElement('div');
  wrapper.className = 'progress-section';
  wrapper.style.display = 'none';
  wrapper.innerHTML = `
    <div class="progress-label"></div>
    <div class="progress-bar"><div class="progress-fill"></div></div>
  `;
  const label = wrapper.querySelector('.progress-label') as HTMLElement;
  const fill = wrapper.querySelector('.progress-fill') as HTMLElement;

  return {
    element: wrapper,
    update(pct: number, text: string) {
      wrapper.style.display = 'block';
      label.textContent = text;
      fill.style.width = `${Math.min(100, pct)}%`;
      fill.classList.remove('indeterminate');
    },
    setIndeterminate(text: string) {
      wrapper.style.display = 'block';
      label.textContent = text;
      fill.style.width = '100%';
      fill.classList.add('indeterminate');
    },
    hide() {
      wrapper.style.display = 'none';
    },
  };
}
