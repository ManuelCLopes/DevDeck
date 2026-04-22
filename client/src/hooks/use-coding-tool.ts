import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppPreferences } from "@/lib/app-preferences";
import { getDesktopApi } from "@/lib/desktop";
import { toast } from "@/hooks/use-toast";
import {
  DEFAULT_DESKTOP_CODING_TOOL_AVAILABILITY,
  getCodingToolLabel,
  getCodingToolShortLabel,
  isCodingToolAvailable,
  openInCodingTool,
  resolvePreferredCodingTool,
  type DesktopCodingToolAvailability,
  type CodingToolId,
} from "@/lib/coding-tool";

export function useCodingTool() {
  const desktopApi = getDesktopApi();
  const { preferences } = useAppPreferences();
  const [availability, setAvailability] = useState<DesktopCodingToolAvailability>(
    DEFAULT_DESKTOP_CODING_TOOL_AVAILABILITY,
  );

  useEffect(() => {
    if (!desktopApi?.getDesktopCodingToolAvailability) {
      return;
    }

    let cancelled = false;
    void desktopApi
      .getDesktopCodingToolAvailability()
      .then((nextAvailability) => {
        if (!cancelled) {
          setAvailability(nextAvailability);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvailability(DEFAULT_DESKTOP_CODING_TOOL_AVAILABILITY);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [desktopApi]);

  const preferredTool = useMemo(
    () => resolvePreferredCodingTool(preferences, availability),
    [availability, preferences],
  );

  const openTool = useCallback(
    async (targetPath: string, explicitTool?: CodingToolId) => {
      const tool = explicitTool ?? preferredTool;
      try {
        await openInCodingTool(targetPath, tool);
      } catch (error) {
        const description =
          error instanceof Error
            ? error.message
            : `DevDeck could not open ${getCodingToolLabel(tool)}.`;

        toast({
          title: `Could not open ${getCodingToolLabel(tool)}`,
          description,
          variant: "destructive",
        });
      }
    },
    [preferredTool],
  );

  return useMemo(
    () => ({
      availability,
      isToolAvailable: (tool: CodingToolId) =>
        isCodingToolAvailable(availability, tool),
      openPreferredTool: openTool,
      preferredTool,
      preferredToolLabel: getCodingToolLabel(preferredTool),
      preferredToolShortLabel: getCodingToolShortLabel(preferredTool),
    }),
    [availability, openTool, preferredTool],
  );
}
