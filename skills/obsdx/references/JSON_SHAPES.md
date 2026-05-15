# JSON Output Shapes

All commands share the same `--json` / `--pretty` / `--ndjson` conventions. Below are the stdout shapes when `--json` is active.

## vault info

```json
{
  "root": "/path/to/vault",
  "obsidianDir": "/path/to/vault/.obsidian",
  "cacheDir": "/path/to/vault/.obsidian/obsdx",
  "config": { /* app.json + types.json */ }
}
```

## index

### build / rebuild

```json
{ "indexed": 42 }
```

### refresh

```json
{ "stale": 3, "deleted": 1, "indexed": 5 }
```

### status

```json
{ "files": 100, "staleFiles": 3, "deletedFiles": 1 }
```

### vacuum

```json
{ "vacuumed": true }
```

## daemon

### start

```json
{ "running": true, "state": { "pid": 1234, "startedAt": "..." } }
```

### stop

```json
{ "running": false }
```

### status

```json
{ "running": true, "state": { "pid": 1234, "startedAt": "..." } }
```

## files

### list

```json
{ "files": [{ "path": "note.md", "folder": "", "ext": "md", "kind": "markdown", "size": 256 }] }
```

### stat

```json
{ "file": { "path": "note.md", "folder": "", "ext": "md", "kind": "markdown", "size": 256 } }
```

### changed

```json
{ "stale": [{ "path": "..." }], "deleted": [{ "path": "..." }] }
```

## read

```json
{ "file": { "path": "note.md", ... }, "content": "raw file content" }
```

## inspect

```json
{
  "file": { "path": "note.md" },
  "properties": [{ "name": "status", "value": "active" }],
  "tags": [{ "tag": "project" }],
  "links": [{ "raw": "[[Other]]", "resolvedPath": "Other.md", ... }],
  "headings": [{ "text": "Title", "level": 1 }]
}
```

## links

### outgoing / backlinks

```json
{ "file": "note.md", "links": [{ "raw": "[[Other]]", "resolvedPath": "Other.md", "heading": null, "blockId": null, "ambiguousPaths": [], "unresolved": false }] }
```

### resolve

```json
{ "input": "[[My Note]]", "from": "daily/2025-01-01.md", "resolved": true, "target": { "path": "My Note.md", "heading": null, "blockId": null, "ambiguousPaths": [], "unresolved": false } }
```

### unresolved / ambiguous

```json
{ "links": [{ "sourcePath": "note.md", "raw": "[[Missing]]" }] }
```

### mentions

```json
{ "query": "alpha", "links": [{ "sourcePath": "note.md", "raw": "[[alpha]]", "resolvedPath": "projects/alpha.md" }] }
```

## search

```json
{ "results": [{ "file": { "path": "note.md" }, "matches": [{ "line": 5, "text": "matching line" }] }] }
```

## base

### list

```json
{ "bases": [{ "path": "tasks.base" }] }
```

### inspect

```json
{ "base": { "path": "tasks.base", "views": [{ "name": "default" }] } }
```

### validate

```json
{ "base": "tasks.base", "valid": true, "errors": [] }
```

### views

```json
{ "base": "tasks.base", "views": [{ "name": "default" }] }
```

### query

```json
{
  "base": "tasks.base",
  "view": "Default",
  "context": "current.md",
  "meta": {
    "type": "table",
    "name": "Default",
    "order": ["file.name", "status", "formula.Score"],
    "sort": [{ "property": "status", "direction": "ASC" }],
    "limit": 20,
    "groupBy": { "property": "status", "direction": "ASC" },
    "summaries": { "status": "Count" }
  },
  "columns": [
    { "id": "file.name", "displayName": "name", "type": "text" },
    { "id": "status", "displayName": "status", "type": "text" },
    { "id": "formula.Score", "displayName": "Score", "type": "number" }
  ],
  "rows": [
    {
      "file": { "path": "tasks/todo.md", "name": "todo" },
      "data": {
        "file.name": "todo",
        "status": "active",
        "formula.Score": 10
      }
    }
  ],
  "groups": [],
  "summaries": { "count": 1 }
}
```

`rows[].file` is row identity. `rows[].data` is keyed by column id and preserves typed values.

## graph

### export

```json
{ "nodes": [{ "path": "note.md" }], "edges": [{ "source": "a.md", "target": "b.md", "type": "link" }] }
```

### neighborhood

```json
{ "nodes": [{ "path": "note.md" }], "edges": [...] }
```

### shortest-path

```json
{ "path": ["a.md", "b.md", "c.md"] }
```

### components

```json
{ "components": [["a.md", "b.md"], ["c.md"]] }
```

### orphans

```json
{ "orphans": [{ "path": "orphan.md" }] }
```

## canvas

### list

```json
{ "canvases": [{ "path": "mind.canvas" }] }
```

### inspect

```json
{ "canvas": { "path": "mind.canvas", "nodes": [...], "edges": [...] } }
```

### graph

```json
{ "nodes": [...], "edges": [...] }
```

## tags

### list

```json
{ "tags": [{ "tag": "project", "count": 12 }] }
```

### files

```json
{ "tag": "project", "files": [{ "file": { "path": "note.md" } }] }
```

### tree

```json
{ "tags": [{ "fullTag": "project", "count": 5, "children": [{ "fullTag": "project/active", "count": 3, "children": [] }] }] }
```

## properties

### list

```json
{ "properties": [{ "name": "status", "count": 20 }] }
```

### get

```json
{ "file": "note.md", "properties": [{ "name": "status", "value": "active" }] }
```

### files

```json
{ "property": "status", "value": "active", "files": [{ "path": "note.md" }] }
```
