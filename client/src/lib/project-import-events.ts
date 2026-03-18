const OPEN_ADD_PROJECTS_DIALOG_EVENT = "devdeck:open-add-projects-dialog";

export function openAddProjectsDialog() {
  window.dispatchEvent(new CustomEvent(OPEN_ADD_PROJECTS_DIALOG_EVENT));
}

export function getOpenAddProjectsDialogEvent() {
  return OPEN_ADD_PROJECTS_DIALOG_EVENT;
}
