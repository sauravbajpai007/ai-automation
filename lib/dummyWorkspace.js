"use strict";

/**
 * In-memory "workspace" registry — dummy data for demos & AI review prompts.
 * Not persisted; resets on process restart.
 */

const workspaces = new Map();
let seq = 1;

function listWorkspaces() {
  return Array.from(workspaces.values());
}

function createWorkspace(name) {
  const id = `ws_${seq++}`;
  const createdAt = new Date().toISOString();
  const row = {
    id,
    name: String(name || "").slice(0, 128),
    createdAt,
    /** synthetic quota for review scenarios */
    quotaBytes: 1024 * 1024 * 50,
  };
  workspaces.set(id, row);
  return row;
}

function getWorkspace(id) {
  return workspaces.get(String(id)) || null;
}

function deleteWorkspace(id) {
  return workspaces.delete(String(id));
}

module.exports = {
  listWorkspaces,
  createWorkspace,
  getWorkspace,
  deleteWorkspace,
};
