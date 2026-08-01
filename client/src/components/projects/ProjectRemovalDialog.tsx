import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ProjectRemovalDialogProps {
  itemName: string;
  itemType?: "collection" | "project" | "selection";
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectCount: number;
  removesAllProjects?: boolean;
}

function getTitle(props: Pick<ProjectRemovalDialogProps, "itemType" | "projectCount">) {
  if (props.itemType === "collection") {
    return "Remove project collection?";
  }

  if (props.projectCount === 1) {
    return "Remove project?";
  }

  return "Remove selected projects?";
}

function getSubject(props: Pick<ProjectRemovalDialogProps, "itemName" | "itemType" | "projectCount">) {
  if (props.itemType === "selection") {
    return `${props.projectCount} selected ${props.projectCount === 1 ? "project" : "projects"}`;
  }

  if (props.itemType === "collection") {
    return `${props.itemName} and its ${props.projectCount} ${props.projectCount === 1 ? "project" : "projects"}`;
  }

  return props.itemName;
}

export default function ProjectRemovalDialog({
  itemName,
  itemType = "project",
  onConfirm,
  onOpenChange,
  open,
  projectCount,
  removesAllProjects = false,
}: ProjectRemovalDialogProps) {
  const subject = getSubject({ itemName, itemType, projectCount });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base font-semibold">
            {getTitle({ itemType, projectCount })}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-6">
            This removes {subject} from DevDeck. Local files, Git branches, and
            remote repositories stay untouched.
            {removesAllProjects ? (
              <>
                {" "}DevDeck will keep running without project monitoring and you
                can add projects again from Preferences.
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
