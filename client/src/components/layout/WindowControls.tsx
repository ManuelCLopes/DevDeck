import { getDesktopApi } from "@/lib/desktop";

interface WindowControlsProps {
  dimmed?: boolean;
}

export default function WindowControls({ dimmed = false }: WindowControlsProps) {
  const desktopApi = getDesktopApi();
  const buttonOpacity = dimmed ? "opacity-50" : "";

  return (
    <div className="mac-window-controls flex items-center gap-2 group no-drag">
      <button
        type="button"
        aria-label="Close window"
        onClick={() => void desktopApi?.windowControls.close()}
        className={`mac-btn mac-btn-close ${buttonOpacity}`}
      />
      <button
        type="button"
        aria-label="Minimize window"
        onClick={() => void desktopApi?.windowControls.minimize()}
        className={`mac-btn mac-btn-minimize ${buttonOpacity}`}
      />
      <button
        type="button"
        aria-label="Toggle maximize"
        onClick={() => void desktopApi?.windowControls.toggleMaximize()}
        className={`mac-btn mac-btn-maximize ${buttonOpacity}`}
      />
    </div>
  );
}
