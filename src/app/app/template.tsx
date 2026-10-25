/**
 * Si rimonta a ogni cambio di sezione: la nuova pagina entra con una dissolvenza breve (250 ms).
 * Con "riduci movimento" attivo l'animazione è disattivata (globals.css).
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
