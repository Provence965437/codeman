export function initArchitectureModal() {
  const trigger = document.getElementById('archTrigger');
  const modal = document.getElementById('archModal');
  const closeBtn = document.getElementById('archClose');
  const backdrop = modal?.querySelector('.arch-modal-backdrop');

  if (!trigger || !modal || !closeBtn) return;

  function openModal() {
    modal.classList.remove('is-hidden');
    document.body.classList.add('arch-modal-open');
    closeBtn.focus();
  }

  function closeModal() {
    modal.classList.add('is-hidden');
    document.body.classList.remove('arch-modal-open');
    trigger.focus();
  }

  trigger.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  backdrop?.addEventListener('click', closeModal);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('is-hidden')) {
      closeModal();
    }
  });
}
