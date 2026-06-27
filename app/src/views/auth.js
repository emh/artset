import { html } from "htm/preact";
import { useState } from "preact/hooks";
import { login, signup } from "../store.js";
import { navigate } from "../router.js";

export function AuthView() {
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [f, setF] = useState({ studioName: "", name: "", email: "", password: "" });

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === "signup") await signup(f);
      else await login(f.email, f.password);
      navigate("/");
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  const isSignup = mode === "signup";

  return html`
    <div class="center-pane">
      <div class="auth">
        <div class="eyebrow" style="margin-bottom:10px">Artset</div>
        <h1 class="display">${isSignup ? "Create your studio" : "Sign in"}</h1>
        <p class="muted" style="margin-top:6px;margin-bottom:28px">
          ${isSignup ? "Start a studio workspace." : "Welcome back."}
        </p>

        <form onSubmit=${submit}>
          ${isSignup && html`
            <label class="field">
              <span class="label">Studio name</span>
              <input class="input" name="organization" autocomplete="organization" value=${f.studioName} onInput=${set("studioName")} placeholder="Gaile Guevara Studio" />
            </label>
            <label class="field">
              <span class="label">Your name</span>
              <input class="input" name="name" autocomplete="name" value=${f.name} onInput=${set("name")} placeholder="Full name" />
            </label>
          `}
          <label class="field">
            <span class="label">Email</span>
            <input class="input" type="email" name="email" autocomplete="email" value=${f.email} onInput=${set("email")} placeholder="you@studio.com" />
          </label>
          <label class="field">
            <span class="label">Password</span>
            <input class="input" type="password" name="password" autocomplete=${isSignup ? "new-password" : "current-password"} value=${f.password} onInput=${set("password")} placeholder=${isSignup ? "At least 8 characters" : "Password"} />
          </label>

          ${err && html`<p style="color:var(--warn);font-size:13px;margin:6px 0 16px">${err}</p>`}

          <button class="btn" style="width:100%" disabled=${busy} type="submit">
            ${busy ? "…" : isSignup ? "Create studio" : "Sign in"}
          </button>
        </form>

        <p style="margin-top:22px;font-size:13px" class="muted">
          ${isSignup ? "Already have an account? " : "New here? "}
          <button class="linkbtn" type="button" onClick=${() => { setErr(null); setMode(isSignup ? "login" : "signup"); }}>
            ${isSignup ? "Sign in" : "Create a studio"}
          </button>
        </p>
      </div>
    </div>
  `;
}
