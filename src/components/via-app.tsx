import React, { useEffect, useState, useCallback } from "react";
import {
  Truck,
  Building2,
  LayoutDashboard,
  Route,
  FileText,
  Store,
  Wallet,
  Plus,
  ArrowUpRight,
  Upload,
  X,
  CheckCircle2,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { parseInvoiceXml } from "../lib/nfe-import";
import { supabase } from "../supabase";

import FiscalWorkspace from "./fiscal-workspace";

import Customers from "./customers";
import PlatformAdmin from "./platform-admin";
import FiscalConnections from "./fiscal-connections";
import TripDetails from "./trip-details";
import FleetRegistry from "./fleet-registry";
import { CarrierSettings, CarrierOperation, type CarrierProfile } from "./carrier-operation";

type Trip = {
  id: string;
  origin: string;
  destination: string;
  driver: string;
  plate: string;
  freight_cents: number;
  status: string;
  organization_id?: string;
};
type Doc = import("./carrier-operation").ReceivedNote;
const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v / 100);
export default function App() {
  const [tripRefresh, setTripRefresh] = useState(0);
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null);
  const [wizardDirty, setWizardDirty] = useState(false);
  const [invoiceKey, setInvoiceKey] = useState("");
  const [profile, setProfile] = useState<CarrierProfile | null>(null);
  const updateProfile = useCallback((p: CarrierProfile | null) => setProfile(p), []);
  const [page, setPage] = useState("Visão geral");
  const [modal, setModal] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [notice, setNotice] = useState("");
  const [tripError, setTripError] = useState("");
  const [loginError, setLoginError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<string | null>(null);
  const [org, setOrg] = useState<string | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [adminFiscalCompany, setAdminFiscalCompany] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [role, setRole] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user.id ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user.id ?? null);
      if (s) setLoginError("");
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!supabase || !user) {
      setOrg(null);
      setRole(null);
      setTrips([]);
      return;
    }
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("organization_id,role")
        .eq("user_id", user)
        .limit(1);
      if (!active) return;
      if (error) {
        setNotice(error.message);
        return;
      }
      setOrg(data?.[0]?.organization_id ?? null);
      setRole(data?.[0]?.role ?? null);
    })();
    return () => {
      active = false;
    };
  }, [user]);
  useEffect(() => {
    let active = true;
    setIsPlatformAdmin(false);
    setAdminFiscalCompany(null);
    if (!supabase || !user) return;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("is_platform_admin");
        if (active && !error) setIsPlatformAdmin(data === true);
      } catch {
        /* Normal tenant use stays available before platform migration. */
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);
  useEffect(() => {
    setTrips([]);
    if (!supabase || !org) return;
    let active = true;
    supabase
      .from("trips")
      .select("*")
      .eq("organization_id", org)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setNotice(error.message);
        else setTrips(data ?? []);
      });
    return () => {
      active = false;
    };
  }, [org, user, tripRefresh]);
  useEffect(() => {
    setDocs([]);
    setProfile(null);
    setInvoiceKey("");
    setSelectedTrip(null);
  }, [user, org]);
  useEffect(() => {
    if (!supabase || !org) return;
    let active = true;
    supabase
      .from("carrier_profiles")
      .select("name,cnpj,rntrc,state_registration,email")
      .eq("organization_id", org)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setNotice(error.message);
        else setProfile(data ?? null);
      });
    return () => {
      active = false;
    };
  }, [org]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setLoginError("");
    setBusy(true);
    try {
      const { error } = await supabase!.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setPassword("");
      setLoginError("");
    } catch (e) {
      setLoginError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createOrg() {
    const name = prompt("Nome da empresa ou operação");
    if (!name?.trim() || !supabase) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("create_organization", {
      organization_name: name.trim(),
    });
    setBusy(false);
    if (error) setNotice(error.message);
    else {
      setOrg(data);
      setRole("owner");
    }
  }
  async function saveTrip(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setTripError("");
    const f = new FormData(e.currentTarget);
    const value = Number(String(f.get("freight")).replace(",", "."));
    if (!Number.isFinite(value) || value < 0) {
      setTripError("Informe um valor válido.");
      return;
    }
    const t: Trip = {
      id: crypto.randomUUID(),
      origin: String(f.get("origin")).trim(),
      destination: String(f.get("destination")).trim(),
      driver: String(f.get("driver")).trim(),
      plate: String(f.get("plate")).toUpperCase().trim(),
      freight_cents: Math.round(value * 100),
      status: "draft",
    };
    if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(t.plate)) {
      setTripError("Confira a placa, sem hífen: ABC1D23 ou ABC1234.");
      return;
    }
    setBusy(true);
    try {
      if (supabase) {
        if (!org) throw Error("Crie uma organização antes de salvar.");
        const { error } = await supabase.from("trips").insert({ ...t, organization_id: org });
        if (error) throw error;
      }
      setTrips((v) => [t, ...v]);
      setModal(false);
      setNotice(
        supabase
          ? "Viagem salva como rascunho."
          : "Rascunho temporário criado. Ele será perdido ao recarregar.",
      );
    } catch (e) {
      setTripError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importXML(file?: File) {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw Error("O XML deve ter até 2 MB.");
      const invoice = parseInvoiceXml(await file.text());
      if (docs.some((d) => d.key === invoice.key))
        throw Error("Esta NF-e já foi importada nesta sessão.");
      setDocs((v) => [...v, invoice]);
      setNotice(
        "XML lido nesta sessão. A leitura não valida autorização na SEFAZ e ainda não é arquivada no banco.",
      );
      setPage("Documentos");
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  const items = [
    ...(isPlatformAdmin ? [["Administração SaaS", Building2] as const] : []),
    ["Visão geral", LayoutDashboard],
    ["Viagens", Route],
    ["Documentos", FileText],
    ["Clientes", Building2],
    ["Operação de frete", Truck],
    ["Minha transportadora", ShieldCheck],
    ["Motoristas e veículos", Truck],
    ["Central fiscal", ShieldCheck],
    ["Integrações fiscais", ShieldCheck],
    ["Hub de cargas", Store],
    ["Financeiro", Wallet],
  ] as const;
  return (
    <div className="shell">
      <aside>
        <a className="brand" href="#">
          <span>
            <Truck size={25} />
          </span>
          via<span className="brand-light">caminhoneiro</span>
        </a>
        <div className="workspace">
          SUA OPERAÇÃO
          <strong>
            {profile?.name || "Minha transportadora"} <span>BR</span>
          </strong>
        </div>
        <nav>
          {items.map(([name, Icon]) => (
            <button
              className={page === name ? "active" : ""}
              onClick={() => {
                if (
                  !wizardDirty ||
                  window.confirm("Há alterações não salvas. Deseja descartá-las?")
                ) {
                  setWizardDirty(false);
                  setPage(name);
                }
              }}
              key={name}
            >
              <Icon size={20} />
              {name}
              {name === "Hub de cargas" && <small>EM BREVE</small>}
            </button>
          ))}
        </nav>
        <div className="aside-bottom">
          <ShieldCheck />
          <strong>Uma estrada mais simples.</strong>
          <p>Sua operação organizada, do início ao destino.</p>
          <span>Via Caminhoneiro · versão inicial</span>
        </div>
      </aside>
      <main>
        <header>
          <span>
            Meu espaço <span className="slash">/</span> <b>{page}</b>
          </span>
          <div className="header-right">
            <span className="mode">
              {supabase ? "Supabase configurado" : "Modo de demonstração"}
            </span>
            {user && (
              <button className="icon" aria-label="Sair" onClick={() => supabase?.auth.signOut()}>
                <LogOut size={18} />
              </button>
            )}
            <span className="avatar">VC</span>
          </div>
        </header>
        <div className="content">
          <div className="eyebrow">SUA OPERAÇÃO, NO CAMINHO CERTO</div>
          <div className="title-row">
            <div>
              <h1>{page === "Visão geral" ? "Tudo pronto para a próxima viagem?" : page}</h1>
              <p>Menos burocracia. Mais tempo para seguir em frente.</p>
            </div>
            <button
              className="primary"
              onClick={() => {
                setTripError("");
                setModal(true);
              }}
            >
              <Plus size={18} /> Nova viagem
            </button>
          </div>
          {!supabase && (
            <div className="banner">
              <ShieldCheck size={20} />
              <span>
                <strong>Explore a primeira versão.</strong> Os rascunhos são temporários. Emissões
                fiscais e CIOT ainda não estão conectados.
              </span>
            </div>
          )}
          {notice && (
            <div className="notice app-toast" role="status">
              {notice}
              <button aria-label="Fechar aviso" onClick={() => setNotice("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {supabase && !user && (
            <form className="panel login" onSubmit={login}>
              <h2>Acesse sua operação</h2>
              {loginError && (
                <div className="notice" role="alert">
                  {loginError}
                </div>
              )}
              <p>Use uma conta cadastrada no Supabase. O acesso é restrito à sua organização.</p>
              <input
                aria-label="E-mail"
                placeholder="Seu e-mail"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                aria-label="Senha"
                placeholder="Sua senha"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button className="primary" disabled={busy}>
                Entrar
              </button>
            </form>
          )}
          {supabase && user && !org && !isPlatformAdmin && (
            <div className="banner">
              Você ainda não participa de uma organização.
              <button className="primary" disabled={busy} onClick={createOrg}>
                Criar minha operação
              </button>
            </div>
          )}
          {(!supabase || (user && org) || (user && isPlatformAdmin)) && (
            <>
              {(page === "Visão geral" || page === "Viagens") && (
                <>
                  <section className="stats">
                    {(
                      [
                        [
                          "Viagens cadastradas",
                          String(trips.length),
                          "Sua operação em um só lugar",
                          Route,
                        ],
                        [
                          "Aguardando revisão",
                          String(trips.length),
                          "Confira antes de emitir",
                          FileText,
                        ],
                        [
                          "Fretes previstos",
                          money(trips.reduce((s, t) => s + t.freight_cents, 0)),
                          "Valores brutos dos rascunhos",
                          Wallet,
                        ],
                      ] as const
                    ).map(([title, value, sub, Icon]) => (
                      <article key={String(title)}>
                        <div>
                          {String(title)}
                          <Icon size={19} />
                        </div>
                        <strong>{String(value)}</strong>
                        <small>{String(sub)}</small>
                      </article>
                    ))}
                  </section>
                  {page === "Visão geral" && (
                    <section className="quick">
                      <div>
                        <span className="pill">DO DOCUMENTO À ESTRADA</span>
                        <h2>
                          Sua próxima viagem
                          <br />
                          começa aqui.
                        </h2>
                        <p>
                          Reúna as informações do frete e acompanhe
                          <br />
                          cada etapa em um único lugar.
                        </p>
                        <button
                          onClick={() => {
                            setTripError("");
                            setModal(true);
                          }}
                        >
                          Organizar uma viagem <ArrowUpRight size={18} />
                        </button>
                      </div>
                      <div className="route-art">
                        <span className="route-label">ORIGEM</span>
                        <div className="route-line">
                          <i />
                          <span />
                          <Truck size={44} />
                          <span />
                          <i />
                        </div>
                        <span className="route-label end">SEU PRÓXIMO DESTINO</span>
                        <div className="art-note">
                          <CheckCircle2 size={17} /> Cada etapa, no seu controle
                        </div>
                      </div>
                    </section>
                  )}
                  {selectedTrip && trips.find((t) => t.id === selectedTrip) && (
                    <TripDetails
                      key={selectedTrip}
                      organizationId={org}
                      trip={trips.find((t) => t.id === selectedTrip)!}
                      onClose={() => setSelectedTrip(null)}
                    />
                  )}
                  <section className="panel">
                    <div className="section-title">
                      <div>
                        <h2>Suas viagens</h2>
                        <p>Do planejamento à chegada.</p>
                      </div>
                      <span className="count">{trips.length} viagens</span>
                    </div>
                    {trips.length ? (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>ROTA</th>
                              <th>MOTORISTA / VEÍCULO</th>
                              <th>FRETE BRUTO</th>
                              <th>SITUAÇÃO</th>
                              <th>AÇÃO</th>
                            </tr>
                          </thead>
                          <tbody>
                            {trips.map((t) => (
                              <tr key={t.id}>
                                <td>
                                  <strong>{t.origin}</strong>
                                  <br />
                                  <span>→ {t.destination}</span>
                                </td>
                                <td>
                                  {t.driver}
                                  <br />
                                  <span>{t.plate}</span>
                                </td>
                                <td>{money(t.freight_cents)}</td>
                                <td>
                                  <span className="status">Rascunho</span>
                                </td>
                                <td>
                                  <button
                                    className="secondary"
                                    onClick={() => {
                                      setSelectedTrip(t.id);
                                      setPage("Viagens");
                                    }}
                                  >
                                    Ver viagem
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="empty">
                        <Route size={32} />
                        <h3>O próximo destino começa com você</h3>
                        <p>Cadastre sua primeira viagem para organizar o frete e os documentos.</p>
                        <button
                          className="secondary"
                          onClick={() => {
                            setTripError("");
                            setModal(true);
                          }}
                        >
                          <Plus size={16} /> Cadastrar viagem
                        </button>
                      </div>
                    )}
                  </section>
                </>
              )}
              {page === "Documentos" && (
                <section className="panel">
                  <div className="section-title">
                    <div>
                      <h2>Documentos da operação</h2>
                      <p>
                        Leitura local de NF-e. Arquivamento e vínculo com viagens serão integrados
                        na próxima etapa.
                      </p>
                    </div>
                  </div>
                  <label className="upload">
                    <Upload />
                    <strong>Importar XML de NF-e</strong>
                    <span>Arquivo de até 2 MB · não altera nem emite documentos fiscais</span>
                    <input
                      type="file"
                      accept=".xml,application/xml,text/xml"
                      onChange={(e) => {
                        void importXML(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {docs.map((d) => (
                    <article className="doc" key={d.key}>
                      <FileText />
                      <div>
                        <strong>
                          NF-e {d.number} · {d.issuer}
                        </strong>
                        <p>{d.key}</p>
                        <small>Importado nesta sessão · autorização não verificada</small>
                      </div>
                    </article>
                  ))}
                </section>
              )}
              {page === "Clientes" && <Customers key={org ?? "demo"} organizationId={org} />}
              {page === "Motoristas e veículos" && (
                <FleetRegistry key={org ?? "demo"} organizationId={org} />
              )}
              {page === "Administração SaaS" && isPlatformAdmin && (
                <PlatformAdmin
                  onConfigureFiscal={(id, name) => {
                    setAdminFiscalCompany({ id, name });
                    setPage("Configuração fiscal da empresa");
                  }}
                />
              )}
              {page === "Configuração fiscal da empresa" &&
                isPlatformAdmin &&
                adminFiscalCompany && (
                  <>
                    <div className="banner">
                      Administração fiscal de {adminFiscalCompany.name}. As credenciais são
                      exclusivas desta empresa.
                    </div>
                    <FiscalConnections
                      key={adminFiscalCompany.id}
                      organizationId={adminFiscalCompany.id}
                      role="platform_admin"
                    />
                  </>
                )}
              {page === "Minha transportadora" && (
                <CarrierSettings organizationId={org} onChange={updateProfile} />
              )}
              {page === "Operação de frete" && (
                <CarrierOperation
                  key={org ?? "demo"}
                  organizationId={org}
                  onDirtyChange={setWizardDirty}
                  onTripCreated={(tripId) => {
                    setWizardDirty(false);
                    setTripRefresh((n) => n + 1);
                    setSelectedTrip(tripId);
                    setPage("Viagens");
                  }}
                  notes={docs}
                  profile={profile}
                  onImport={() => setPage("Documentos")}
                  onFiscal={(key) => {
                    setInvoiceKey(key);
                    setPage("Central fiscal");
                  }}
                />
              )}
              {page === "Integrações fiscais" && (
                <FiscalConnections key={org ?? "demo"} organizationId={org} role={role} />
              )}
              {page === "Central fiscal" && (
                <FiscalWorkspace key={org ?? "demo"} trips={trips} initialKeys={invoiceKey} />
              )}
              {page === "Hub de cargas" && (
                <section className="panel empty">
                  <Store size={38} />
                  <h2>Novas conexões, novos caminhos.</h2>
                  <p>
                    O hub receberá ofertas de cargas e serviços, propostas e contratação.
                    <br />
                    Esta versão ainda não publica nem aceita ofertas.
                  </p>
                  <span className="status">Em planejamento</span>
                </section>
              )}
              {page === "Financeiro" && (
                <section className="panel empty">
                  <Wallet size={38} />
                  <h2>Clareza para cada frete.</h2>
                  <p>
                    Total bruto previsto:{" "}
                    <strong>{money(trips.reduce((s, t) => s + t.freight_cents, 0))}</strong>
                  </p>
                  <p>
                    Retenções, despesas, pagamentos e valores líquidos ainda não foram calculados.
                  </p>
                  <span className="status">Regras fiscais pendentes de validação</span>
                </section>
              )}
            </>
          )}
          <footer>
            Feito para quem movimenta o Brasil.<span>Via Caminhoneiro</span>
          </footer>
        </div>
      </main>
      {modal && (
        <div className="overlay">
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <button className="close" aria-label="Fechar" onClick={() => setModal(false)}>
              <X />
            </button>
            <span className="eyebrow">VAMOS PEGAR A ESTRADA</span>
            <h2 id="dialog-title">Nova viagem</h2>
            <p>Comece pelo essencial. A viagem será salva como rascunho.</p>
            {tripError && (
              <div className="notice" role="alert">
                {tripError}
              </div>
            )}
            <form onSubmit={saveTrip}>
              <label>
                Origem
                <input name="origin" placeholder="Cidade / UF" required maxLength={120} />
              </label>
              <label>
                Destino
                <input name="destination" placeholder="Cidade / UF" required maxLength={120} />
              </label>
              <label>
                Motorista
                <input name="driver" required maxLength={120} />
              </label>
              <div className="form-row">
                <label>
                  Placa
                  <input name="plate" placeholder="ABC1D23" required maxLength={7} />
                </label>
                <label>
                  Frete bruto (R$)
                  <input
                    name="freight"
                    type="number"
                    min="0"
                    max="100000000"
                    step="0.01"
                    required
                  />
                </label>
              </div>
              <p className="hint">Criar um rascunho não emite CT-e, MDF-e ou CIOT.</p>
              <button className="primary" disabled={busy || (!!supabase && !org)}>
                {busy ? "Salvando…" : "Salvar rascunho"}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
