import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkspaceSelectionFromImport,
  getManagedProjectCollections,
  mergeWorkspaceSelection,
  moveManagedProject,
  moveManagedProjectCollection,
  removeManagedProjectCollection,
  removeManagedProjects,
  removeManagedProject,
} from "./workspace-selection";

test("buildWorkspaceSelectionFromImport attaches collection and workspace metadata", () => {
  const selection = buildWorkspaceSelectionFromImport({
    candidates: [
      {
        id: "Desktop/client",
        name: "client",
        relativePath: "client",
        repositoryCount: 1,
      },
    ],
    collectionName: "Frontend",
    rootName: "Desktop",
    rootPath: "/Users/manuellopes/Desktop",
    selectedProjectIds: ["Desktop/client"],
  });

  assert.equal(selection.projects[0]?.collectionName, "Frontend");
  assert.equal(selection.projects[0]?.workspaceName, "Desktop");
  assert.equal(selection.projects[0]?.workspacePath, "/Users/manuellopes/Desktop");
  assert.equal(selection.projects[0]?.localPath, "/Users/manuellopes/Desktop/client");
});

test("mergeWorkspaceSelection preserves existing collection names and appends new projects", () => {
  const currentSelection = buildWorkspaceSelectionFromImport({
    candidates: [
      {
        id: "Desktop/client",
        localPath: "/Users/manuellopes/Desktop/client",
        name: "client",
        relativePath: "client",
        repositoryCount: 1,
      },
    ],
    collectionName: "Frontend",
    rootName: "Desktop",
    rootPath: "/Users/manuellopes/Desktop",
    selectedProjectIds: ["Desktop/client"],
  });
  const nextSelection = buildWorkspaceSelectionFromImport({
    candidates: [
      {
        id: "Desktop/client",
        localPath: "/Users/manuellopes/Desktop/client",
        name: "client",
        relativePath: "client",
        repositoryCount: 1,
      },
      {
        id: "Desktop/server",
        localPath: "/Users/manuellopes/Desktop/server",
        name: "server",
        relativePath: "server",
        repositoryCount: 1,
      },
    ],
    collectionName: "Renamed",
    rootName: "Desktop",
    rootPath: "/Users/manuellopes/Desktop",
    selectedProjectIds: ["Desktop/client", "Desktop/server"],
  });

  const mergedSelection = mergeWorkspaceSelection(currentSelection, nextSelection);

  assert.equal(mergedSelection.projects.length, 2);
  assert.equal(mergedSelection.projects[0]?.collectionName, "Frontend");
  assert.equal(mergedSelection.projects[1]?.name, "server");
  assert.equal(mergedSelection.projects[1]?.order, 1);
});

test("getManagedProjectCollections groups projects by collection", () => {
  const frontendSelection = buildWorkspaceSelectionFromImport({
    candidates: [
      {
        id: "Desktop/client",
        localPath: "/Users/manuellopes/Desktop/client",
        name: "client",
        relativePath: "client",
        repositoryCount: 1,
      },
      {
        id: "Desktop/web",
        localPath: "/Users/manuellopes/Desktop/web",
        name: "web",
        relativePath: "web",
        repositoryCount: 1,
      },
    ],
    collectionName: "Frontend",
    rootName: "Desktop",
    rootPath: "/Users/manuellopes/Desktop",
    selectedProjectIds: ["Desktop/client", "Desktop/web"],
  });
  const backendSelection = buildWorkspaceSelectionFromImport({
    candidates: [
      {
        id: "Services/api",
        localPath: "/Users/manuellopes/Services/api",
        name: "api",
        relativePath: "api",
        repositoryCount: 1,
      },
    ],
    collectionName: "Backend",
    rootName: "Services",
    rootPath: "/Users/manuellopes/Services",
    selectedProjectIds: ["Services/api"],
  });
  const mergedSelection = mergeWorkspaceSelection(frontendSelection, backendSelection);
  const collections = getManagedProjectCollections(mergedSelection);

  assert.equal(collections.length, 2);
  assert.equal(collections[0]?.name, "Frontend");
  assert.equal(collections[0]?.projects.length, 2);
  assert.equal(collections[1]?.name, "Backend");
});

test("moveManagedProjectCollection reorders collection blocks", () => {
  const frontendSelection = buildWorkspaceSelectionFromImport({
    candidates: [
      {
        id: "Desktop/client",
        localPath: "/Users/manuellopes/Desktop/client",
        name: "client",
        relativePath: "client",
        repositoryCount: 1,
      },
    ],
    collectionName: "Frontend",
    rootName: "Desktop",
    rootPath: "/Users/manuellopes/Desktop",
    selectedProjectIds: ["Desktop/client"],
  });
  const backendSelection = buildWorkspaceSelectionFromImport({
    candidates: [
      {
        id: "Services/api",
        localPath: "/Users/manuellopes/Services/api",
        name: "api",
        relativePath: "api",
        repositoryCount: 1,
      },
    ],
    collectionName: "Backend",
    rootName: "Services",
    rootPath: "/Users/manuellopes/Services",
    selectedProjectIds: ["Services/api"],
  });

  const mergedSelection = mergeWorkspaceSelection(frontendSelection, backendSelection);
  const backendCollectionId =
    getManagedProjectCollections(mergedSelection).find(
      (collection) => collection.name === "Backend",
    )?.id ?? "";
  const movedSelection = moveManagedProjectCollection(
    mergedSelection,
    backendCollectionId,
    "up",
  );

  assert.equal(getManagedProjectCollections(movedSelection)[0]?.name, "Backend");
});

test("moveManagedProject reorders projects inside the same collection", () => {
  const selection = buildWorkspaceSelectionFromImport({
    candidates: [
      {
        id: "Desktop/client",
        localPath: "/Users/manuellopes/Desktop/client",
        name: "client",
        relativePath: "client",
        repositoryCount: 1,
      },
      {
        id: "Desktop/web",
        localPath: "/Users/manuellopes/Desktop/web",
        name: "web",
        relativePath: "web",
        repositoryCount: 1,
      },
    ],
    collectionName: "Frontend",
    rootName: "Desktop",
    rootPath: "/Users/manuellopes/Desktop",
    selectedProjectIds: ["Desktop/client", "Desktop/web"],
  });
  const movedSelection = moveManagedProject(selection, "Desktop/web", "up");

  assert.equal(getManagedProjectCollections(movedSelection)[0]?.projects[0]?.name, "web");
});

test("removeManagedProject returns null when the last project is removed", () => {
  const selection = buildWorkspaceSelectionFromImport({
    candidates: [
      {
        id: "Desktop/client",
        localPath: "/Users/manuellopes/Desktop/client",
        name: "client",
        relativePath: "client",
        repositoryCount: 1,
      },
    ],
    collectionName: "Frontend",
    rootName: "Desktop",
    rootPath: "/Users/manuellopes/Desktop",
    selectedProjectIds: ["Desktop/client"],
  });

  assert.equal(removeManagedProject(selection, "Desktop/client"), null);
});

test("removeManagedProjects removes multiple selections at once", () => {
  const selection = buildWorkspaceSelectionFromImport({
    candidates: [
      {
        id: "Desktop/client",
        localPath: "/Users/manuellopes/Desktop/client",
        name: "client",
        relativePath: "client",
        repositoryCount: 1,
      },
      {
        id: "Desktop/web",
        localPath: "/Users/manuellopes/Desktop/web",
        name: "web",
        relativePath: "web",
        repositoryCount: 1,
      },
      {
        id: "Desktop/api",
        localPath: "/Users/manuellopes/Desktop/api",
        name: "api",
        relativePath: "api",
        repositoryCount: 1,
      },
    ],
    collectionName: "Frontend",
    rootName: "Desktop",
    rootPath: "/Users/manuellopes/Desktop",
    selectedProjectIds: ["Desktop/client", "Desktop/web", "Desktop/api"],
  });

  const nextSelection = removeManagedProjects(selection, ["Desktop/client", "Desktop/api"]);

  assert.equal(nextSelection?.projects.length, 1);
  assert.equal(nextSelection?.projects[0]?.name, "web");
});

test("removeManagedProjectCollection removes an entire collection", () => {
  const frontendSelection = buildWorkspaceSelectionFromImport({
    candidates: [
      {
        id: "Desktop/client",
        localPath: "/Users/manuellopes/Desktop/client",
        name: "client",
        relativePath: "client",
        repositoryCount: 1,
      },
    ],
    collectionName: "Frontend",
    rootName: "Desktop",
    rootPath: "/Users/manuellopes/Desktop",
    selectedProjectIds: ["Desktop/client"],
  });
  const backendSelection = buildWorkspaceSelectionFromImport({
    candidates: [
      {
        id: "Services/api",
        localPath: "/Users/manuellopes/Services/api",
        name: "api",
        relativePath: "api",
        repositoryCount: 1,
      },
    ],
    collectionName: "Backend",
    rootName: "Services",
    rootPath: "/Users/manuellopes/Services",
    selectedProjectIds: ["Services/api"],
  });

  const mergedSelection = mergeWorkspaceSelection(frontendSelection, backendSelection);
  const frontendCollectionId =
    getManagedProjectCollections(mergedSelection).find(
      (collection) => collection.name === "Frontend",
    )?.id ?? "";
  const nextSelection = removeManagedProjectCollection(
    mergedSelection,
    frontendCollectionId,
  );

  assert.equal(nextSelection?.projects.length, 1);
  assert.equal(nextSelection?.projects[0]?.name, "api");
});
