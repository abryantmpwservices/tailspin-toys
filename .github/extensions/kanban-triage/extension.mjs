import { createServer } from "node:http";
import { createCanvas, joinSession, CanvasError } from "@github/copilot-sdk/extension";

const issues = [
    { number: 6, title: "Implement pagination on the game list page", description: "Add paginated data helpers, accessible controls, and unit/e2e coverage so the growing catalog stays fast and manageable.", why: "Newest issue and a direct performance concern." },
    { number: 5, title: "Show a catalog summary on the home page", description: "Display total games and average star rating with empty-data handling and deterministic tests.", why: "Newest issue and a focused, high-visibility improvement." },
    { number: 4, title: "Add a publisher page listing that publisher's games", description: "Create prerendered publisher pages with descriptions, linked names, reused game cards, and complete coverage.", why: "Newest navigation feature with several connected surfaces." },
    { number: 3, title: "Show category and publisher descriptions on the game detail page", description: "Expose existing descriptions on detail pages and hide missing content gracefully." },
    { number: 2, title: "Allow users to sort the game list", description: "Add accessible title and rating sorting, including sensible handling for unrated games." },
    { number: 1, title: "Add a search box to find games by title", description: "Add case-insensitive title search, an empty state, and accessible controls." },
];
const servers = new Map();
const esc = (value) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function card(issue, priority) {
    return `<article class="card ${priority ? "priority" : ""}"><div class="head"><span>#${issue.number}</span><h3>${esc(issue.title)}</h3></div><p>${esc(issue.description)}</p>${priority ? `<p class="why"><strong>Why now:</strong> ${esc(issue.why)}</p>` : ""}<button data-number="${issue.number}">Add to current context</button></article>`;
}
function html() {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Issue triage board</title><style>
    :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;padding:24px;background:var(--background-color-default,#0d1117);color:var(--text-color-default,#e6edf3);font:14px/1.5 var(--font-sans,system-ui)}main{max-width:1000px;margin:auto}h1{margin:0 0 4px;font-size:26px}.muted{color:var(--text-color-muted,#8b949e)}section{margin-top:28px}h2{font-size:18px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}.card{border:1px solid var(--border-color-default,#30363d);border-radius:10px;padding:16px;background:#161b22}.priority{border-color:#388bfd}.head{display:flex;gap:8px;align-items:start}.head span{color:#58a6ff;font-weight:700}h3{margin:0;font-size:16px}.why{padding:10px;border-left:3px solid #388bfd;background:#1c2633}button{border:0;border-radius:6px;padding:8px 12px;color:white;background:#238636;cursor:pointer}button:focus{outline:2px solid #58a6ff;outline-offset:2px}button:disabled{opacity:.7}.status{min-height:22px;margin-top:18px;color:#7ee787}</style></head><body><main>
    <h1>Issue triage board</h1><p class="muted">Top three issues most likely to need attention right now, followed by the rest.</p>
    <section><h2>Needs attention now</h2><div class="grid">${issues.slice(0, 3).map((i) => card(i, true)).join("")}</div></section>
    <section><h2>Other open issues</h2><div class="grid">${issues.slice(3).map((i) => card(i, false)).join("")}</div></section><div class="status" role="status" aria-live="polite"></div>
    <script>const status=document.querySelector(".status");document.querySelectorAll("button").forEach((b)=>b.onclick=async()=>{b.disabled=true;const r=await fetch("/add",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({number:Number(b.dataset.number)})});status.textContent=(await r.json()).message;b.disabled=false})</script>
    </main></body></html>`;
}
async function startServer() {
    const server = createServer((req, res) => {
        if (req.method === "POST" && req.url === "/add") {
            let body = "";
            req.on("data", (chunk) => { body += chunk; });
            req.on("end", async () => {
                const issue = issues.find((item) => item.number === JSON.parse(body).number);
                if (!issue) throw new CanvasError("issue_not_found", "Issue not found.");
                await session.send(`Add issue #${issue.number} to the current context: ${issue.title}. ${issue.description}`);
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ message: `Issue #${issue.number} added to the current context.` }));
            });
            return;
        }
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(html());
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

const session = await joinSession({ canvases: [createCanvas({
    id: "kanban-triage",
    displayName: "Issue triage board",
    description: "A Kanban board prioritizing open repository issues and adding selected issues to the current session context.",
    actions: [{
        name: "add_issue_to_context",
        description: "Add an issue from the board to the current session context.",
        inputSchema: { type: "object", properties: { number: { type: "integer" } }, required: ["number"], additionalProperties: false },
        handler: async (ctx) => {
            const issue = issues.find((item) => item.number === ctx.input.number);
            if (!issue) throw new CanvasError("issue_not_found", "Issue not found.");
            await session.send(`Add issue #${issue.number} to the current context: ${issue.title}. ${issue.description}`);
            return { issue: issue.number, added: true };
        },
    }],
    open: async (ctx) => {
        let entry = servers.get(ctx.instanceId);
        if (!entry) { entry = await startServer(); servers.set(ctx.instanceId, entry); }
        return { title: "Issue triage board", url: entry.url };
    },
    onClose: async (ctx) => {
        const entry = servers.get(ctx.instanceId);
        if (entry) { servers.delete(ctx.instanceId); await new Promise((resolve) => entry.server.close(resolve)); }
    },
})] });
