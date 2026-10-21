import { useEffect, useState } from "react";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  Route,
  Search,
  Settings2,
  ShieldCheck,
  Store,
  Truck,
  Users,
  Wallet,
  X,
} from "lucide-react";
const groups = [
  { name: "Plataforma", admin: true, items: [["Administração SaaS", Building2]] },
  {
    name: "Operação",
    items: [
      ["Visão geral", LayoutDashboard],
      ["Operação de frete", Truck],
      ["Viagens", Route],
      ["Documentos", FileText],
    ],
  },
  {
    name: "Cadastros",
    items: [
      ["Clientes", Users],
      ["Motoristas e veículos", Truck],
      ["Minha transportadora", Building2],
    ],
  },
  {
    name: "Gestão",
    items: [
      ["Central fiscal", ShieldCheck],
      ["Integrações fiscais", Settings2],
      ["Financeiro", Wallet],
      ["Hub de cargas", Store],
    ],
  },
] as const;
export default function AppNavigation({
  page,
  company,
  isAdmin,
  collapsed,
  onToggle,
  onNavigate,
}: {
  page: string;
  company: string;
  isAdmin: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onNavigate: (page: string) => boolean;
}) {
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    if (!mobileOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth > 800) setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [mobileOpen]);
  const visible = groups
    .filter((group) => !("admin" in group) || isAdmin)
    .map((group) => ({
      ...group,
      items: group.items.filter(([name]) =>
        name.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")),
      ),
    }))
    .filter((group) => group.items.length);
  function navigate(name: string) {
    if (onNavigate(name)) setMobileOpen(false);
  }
  return (
    <>
      {mobileOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Fechar navegação"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`app-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-brand-row">
          <a
            className="brand"
            href="#"
            aria-label="Via Caminhoneiro — início"
            onClick={(event) => {
              event.preventDefault();
              navigate("Visão geral");
            }}
          >
            <span>
              <Truck size={23} />
            </span>
            <span className="brand-name">
              via<span className="brand-light">caminhoneiro</span>
            </span>
          </a>
          <button
            className="mobile-menu-toggle"
            aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileOpen}
            aria-controls="workspace-navigation"
            onClick={() => setMobileOpen((value) => !value)}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        <div className="sidebar-body" id="workspace-navigation">
          <div className="workspace">
            <span className="workspace-avatar">
              <Building2 size={19} />
            </span>
            <div>
              <span>ESPAÇO DE TRABALHO</span>
              <strong title={company}>{company}</strong>
            </div>
          </div>
          <label className="menu-search">
            <Search size={16} />
            <input
              aria-label="Buscar no menu"
              placeholder="Encontrar uma função…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <nav className="app-navigation" aria-label="Navegação principal">
            {visible.map((group) => (
              <div className="nav-group" key={group.name}>
                <span className="nav-group-label">{group.name}</span>
                {group.items.map(([name, Icon]) => (
                  <button
                    key={name}
                    className={
                      page === name ||
                      (name === "Administração SaaS" && page === "Configuração fiscal da empresa")
                        ? "active"
                        : ""
                    }
                    aria-current={page === name ? "page" : undefined}
                    title={collapsed ? name : undefined}
                    onClick={() => navigate(name)}
                  >
                    <Icon size={19} />
                    <span className="nav-item-label">{name}</span>
                    {name === "Hub de cargas" && <small>EM BREVE</small>}
                    {page === name && <ChevronRight size={14} className="nav-active-arrow" />}
                  </button>
                ))}
              </div>
            ))}
            {!visible.length && <p className="menu-no-results">Nenhuma função encontrada.</p>}
          </nav>
          <div className="sidebar-footer">
            <div className="sidebar-support">
              <ShieldCheck size={18} />
              <span>
                <strong>Seu espaço de operação</strong>
                <small>Dados separados por empresa</small>
              </span>
            </div>
            <button
              className="sidebar-collapse"
              onClick={onToggle}
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            >
              {collapsed ? (
                <ChevronRight size={19} />
              ) : (
                <>
                  <PanelLeftClose size={18} />
                  <span>Recolher menu</span>
                  <ChevronLeft size={15} />
                </>
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
