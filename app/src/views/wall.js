import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { api } from "../api.js";
import { crumbs } from "../store.js";
import { WallSpecEditor } from "../components/wall-spec-editor.js";

export function WallView({ projectId, roomId, wallId }) {
  const [wall, setWall] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    api.get(`/api/walls/${wallId}`)
      .then((d) => {
        if (!alive) return;
        setWall(d.wall);
        crumbs.value = [
          { label: d.wall.project_name, href: `/projects/${projectId}` },
          { label: d.wall.room_name, href: `/projects/${projectId}/rooms/${roomId}` },
          { label: d.wall.name },
        ];
      })
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [wallId]);

  return html`
    <main>
      <div class="wrap">
        ${err && html`<div class="empty"><p>${err}</p></div>`}
        ${!err && !wall && html`<p class="spinner">Loading…</p>`}
        ${wall && html`<${WallSpecEditor} wall=${wall} projectId=${projectId} placeArtId=${new URLSearchParams(location.search).get("place")} onChange=${(w) => setWall(w)} />`}
      </div>
    </main>
  `;
}
