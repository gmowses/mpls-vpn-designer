import { useState, useEffect } from 'react'
import { Sun, Moon, Languages, Network, Plus, Trash2, Copy, Check } from 'lucide-react'

const translations = {
  en: {
    title: 'MPLS L3VPN Designer',
    subtitle: 'Design MPLS L3VPN topologies: configure VRFs, Route Distinguishers, Route Targets and generate PE configurations.',
    vpnName: 'VPN Name',
    customerSites: 'Customer Sites',
    siteName: 'Site Name',
    peRouter: 'PE Router',
    ceRouter: 'CE Router',
    ceRouting: 'PE-CE Routing',
    addSite: 'Add Site',
    removeSite: 'Remove',
    rd: 'Route Distinguisher (RD)',
    rtImport: 'RT Import',
    rtExport: 'RT Export',
    rdFormat: 'Format: ASN:NN (e.g. 65000:100) or IP:NN (e.g. 10.0.0.1:100)',
    vendor: 'Vendor',
    generateConfig: 'Generate Config',
    copy: 'Copy',
    copied: 'Copied!',
    output: 'Generated VRF Configuration',
    topology: 'Topology',
    noConfig: 'Fill in the VPN details and click "Generate Config".',
    references: 'References',
    refList: ['RFC 4364 - BGP/MPLS IP VPNs', 'RFC 4760 - Multiprotocol Extensions for BGP-4'],
    builtBy: 'Built by',
    ceRoutingBgp: 'BGP',
    ceRoutingOspf: 'OSPF',
    ceRoutingStatic: 'Static',
    noSites: 'No sites added yet.',
  },
  pt: {
    title: 'Designer MPLS L3VPN',
    subtitle: 'Projete topologias MPLS L3VPN: configure VRFs, Route Distinguishers, Route Targets e gere configuracoes de PE.',
    vpnName: 'Nome da VPN',
    customerSites: 'Sites do Cliente',
    siteName: 'Nome do Site',
    peRouter: 'Roteador PE',
    ceRouter: 'Roteador CE',
    ceRouting: 'Roteamento PE-CE',
    addSite: 'Adicionar Site',
    removeSite: 'Remover',
    rd: 'Route Distinguisher (RD)',
    rtImport: 'RT Import',
    rtExport: 'RT Export',
    rdFormat: 'Formato: ASN:NN (ex: 65000:100) ou IP:NN (ex: 10.0.0.1:100)',
    vendor: 'Fabricante',
    generateConfig: 'Gerar Configuracao',
    copy: 'Copiar',
    copied: 'Copiado!',
    output: 'Configuracao VRF Gerada',
    topology: 'Topologia',
    noConfig: 'Preencha os detalhes da VPN e clique em "Gerar Configuracao".',
    references: 'Referencias',
    refList: ['RFC 4364 - BGP/MPLS IP VPNs', 'RFC 4760 - Extensoes Multiprotocolo para BGP-4'],
    builtBy: 'Criado por',
    ceRoutingBgp: 'BGP',
    ceRoutingOspf: 'OSPF',
    ceRoutingStatic: 'Estatico',
    noSites: 'Nenhum site adicionado ainda.',
  },
} as const

type Lang = keyof typeof translations
type Vendor = 'cisco' | 'juniper'
type CeRouting = 'bgp' | 'ospf' | 'static'

interface Site {
  id: string
  name: string
  pe: string
  ce: string
  routing: CeRouting
}

let uid = 0

function generateCiscoVrf(vpnName: string, rd: string, rtImport: string, rtExport: string, sites: Site[]): string {
  const lines: string[] = []

  // VRF definition
  lines.push(`! VRF Configuration for ${vpnName}`)
  lines.push(`vrf definition ${vpnName}`)
  lines.push(` rd ${rd}`)
  lines.push(` !`)
  lines.push(` address-family ipv4`)
  for (const rt of rtImport.split(',').map(s => s.trim()).filter(Boolean)) {
    lines.push(`  route-target import ${rt}`)
  }
  for (const rt of rtExport.split(',').map(s => s.trim()).filter(Boolean)) {
    lines.push(`  route-target export ${rt}`)
  }
  lines.push(` exit-address-family`)
  lines.push('!')

  // Per-site PE interface
  for (const site of sites) {
    lines.push(`! Site: ${site.name}`)
    lines.push(`interface GigabitEthernet0/0.${uid++}`)
    lines.push(` vrf forwarding ${vpnName}`)
    lines.push(` ip address <PE-CE-IP> <mask>`)
    if (site.routing === 'bgp') {
      lines.push(`!`)
      lines.push(`router bgp <PE-ASN>`)
      lines.push(` address-family ipv4 vrf ${vpnName}`)
      lines.push(`  neighbor <CE-IP> remote-as <CE-ASN>`)
      lines.push(`  neighbor <CE-IP> activate`)
      lines.push(`  redistribute connected`)
      lines.push(` exit-address-family`)
    } else if (site.routing === 'ospf') {
      lines.push(`!`)
      lines.push(`router ospf <PROC-ID> vrf ${vpnName}`)
      lines.push(` network <PE-CE-NET> <WILDCARD> area 0`)
      lines.push(` redistribute bgp <PE-ASN> subnets`)
    } else {
      lines.push(` ip route vrf ${vpnName} <CE-NETWORK> <MASK> <CE-IP>`)
    }
    lines.push('!')
  }

  // MP-BGP
  lines.push(`! MP-BGP VPNv4 between PEs`)
  lines.push(`router bgp <PE-ASN>`)
  lines.push(` address-family vpnv4`)
  lines.push(`  neighbor <RR-or-PE-IP> activate`)
  lines.push(`  neighbor <RR-or-PE-IP> send-community extended`)
  lines.push(` exit-address-family`)
  lines.push('!')

  return lines.join('\n')
}

function generateJuniperVrf(vpnName: string, rd: string, rtImport: string, rtExport: string, sites: Site[]): string {
  const lines: string[] = []
  lines.push(`/* L3VPN: ${vpnName} */`)
  lines.push(`routing-instances {`)
  lines.push(`    ${vpnName} {`)
  lines.push(`        instance-type vrf;`)
  lines.push(`        route-distinguisher ${rd};`)
  for (const rt of rtImport.split(',').map(s => s.trim()).filter(Boolean)) {
    lines.push(`        vrf-import ${rt}-IMPORT;`)
  }
  for (const rt of rtExport.split(',').map(s => s.trim()).filter(Boolean)) {
    lines.push(`        vrf-export ${rt}-EXPORT;`)
  }
  lines.push(`        vrf-table-label;`)
  for (const site of sites) {
    lines.push(`        /* Site: ${site.name} (CE: ${site.ce}) */`)
    lines.push(`        interface ge-0/0/0.<unit>;`)
    if (site.routing === 'bgp') {
      lines.push(`        protocols {`)
      lines.push(`            bgp {`)
      lines.push(`                group ${site.name}-CE {`)
      lines.push(`                    peer-as <CE-ASN>;`)
      lines.push(`                    neighbor <CE-IP>;`)
      lines.push(`                }`)
      lines.push(`            }`)
      lines.push(`        }`)
    } else if (site.routing === 'ospf') {
      lines.push(`        protocols {`)
      lines.push(`            ospf {`)
      lines.push(`                area 0.0.0.0 {`)
      lines.push(`                    interface ge-0/0/0.<unit>;`)
      lines.push(`                }`)
      lines.push(`                export EXPORT-TO-BGP;`)
      lines.push(`            }`)
      lines.push(`        }`)
    } else {
      lines.push(`        routing-options {`)
      lines.push(`            static { route <CE-NETWORK/PREFIX> next-hop <CE-IP>; }`)
      lines.push(`        }`)
    }
  }
  lines.push(`    }`)
  lines.push(`}`)
  lines.push(`/* RT policies */`)
  for (const rt of rtImport.split(',').map(s => s.trim()).filter(Boolean)) {
    lines.push(`policy-options {`)
    lines.push(`    policy-statement ${rt}-IMPORT {`)
    lines.push(`        term match-rt {`)
    lines.push(`            from community comm-${rt.replace(':', '-')};`)
    lines.push(`            then accept;`)
    lines.push(`        }`)
    lines.push(`    }`)
    lines.push(`    community comm-${rt.replace(':', '-')} members target:${rt};`)
    lines.push(`}`)
  }
  return lines.join('\n')
}

export default function MplsVpnDesigner() {
  const [lang, setLang] = useState<Lang>(() => (navigator.language.startsWith('pt') ? 'pt' : 'en'))
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [vpnName, setVpnName] = useState('CUSTOMER-A')
  const [rd, setRd] = useState('65000:100')
  const [rtImport, setRtImport] = useState('65000:100')
  const [rtExport, setRtExport] = useState('65000:100')
  const [vendor, setVendor] = useState<Vendor>('cisco')
  const [sites, setSites] = useState<Site[]>([
    { id: 's0', name: 'HQ', pe: 'PE-1', ce: 'CE-HQ', routing: 'bgp' },
    { id: 's1', name: 'Branch-1', pe: 'PE-2', ce: 'CE-BR1', routing: 'bgp' },
  ])
  const [newSiteName, setNewSiteName] = useState('')
  const [newPe, setNewPe] = useState('')
  const [newCe, setNewCe] = useState('')
  const [newRouting, setNewRouting] = useState<CeRouting>('bgp')
  const [config, setConfig] = useState('')
  const [copied, setCopied] = useState(false)

  const t = translations[lang]
  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])

  const addSite = () => {
    if (!newSiteName.trim()) return
    setSites(prev => [...prev, { id: `s${uid++}`, name: newSiteName.trim(), pe: newPe.trim() || 'PE-1', ce: newCe.trim() || 'CE-1', routing: newRouting }])
    setNewSiteName('')
    setNewPe('')
    setNewCe('')
  }

  const removeSite = (id: string) => setSites(prev => prev.filter(s => s.id !== id))

  const generate = () => {
    const result = vendor === 'cisco'
      ? generateCiscoVrf(vpnName, rd, rtImport, rtExport, sites)
      : generateJuniperVrf(vpnName, rd, rtImport, rtExport, sites)
    setConfig(result)
  }

  const handleCopy = () => {
    if (!config) return
    navigator.clipboard.writeText(config).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const inputCls = "w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 transition-colors">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <Network size={18} className="text-white" />
            </div>
            <span className="font-semibold">MPLS L3VPN Designer</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setLang(l => l === 'en' ? 'pt' : 'en')} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
              <Languages size={14} />{lang.toUpperCase()}
            </button>
            <button onClick={() => setDark(d => !d)} className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <a href="https://github.com/gmowses/mpls-vpn-designer" target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 py-10">
        <div className="max-w-5xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-bold">{t.title}</h1>
            <p className="mt-2 text-zinc-500 dark:text-zinc-400">{t.subtitle}</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              {/* VPN Config */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4">
                <h2 className="font-semibold">VPN</h2>
                <div><label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{t.vpnName}</label><input className={`mt-1 ${inputCls}`} value={vpnName} onChange={e => setVpnName(e.target.value)} /></div>
                <div><label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{t.rd}</label><input className={`mt-1 ${inputCls}`} value={rd} onChange={e => setRd(e.target.value)} placeholder="65000:100" /><p className="text-[10px] text-zinc-400 mt-1">{t.rdFormat}</p></div>
                <div><label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{t.rtImport}</label><input className={`mt-1 ${inputCls}`} value={rtImport} onChange={e => setRtImport(e.target.value)} placeholder="65000:100" /></div>
                <div><label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{t.rtExport}</label><input className={`mt-1 ${inputCls}`} value={rtExport} onChange={e => setRtExport(e.target.value)} placeholder="65000:100" /></div>
              </div>

              {/* Sites */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-3">
                <h2 className="font-semibold">{t.customerSites}</h2>
                <div className="grid grid-cols-2 gap-2">
                  <input className={inputCls} placeholder={t.siteName} value={newSiteName} onChange={e => setNewSiteName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSite()} />
                  <input className={inputCls} placeholder={t.peRouter} value={newPe} onChange={e => setNewPe(e.target.value)} />
                  <input className={inputCls} placeholder={t.ceRouter} value={newCe} onChange={e => setNewCe(e.target.value)} />
                  <select className={inputCls} value={newRouting} onChange={e => setNewRouting(e.target.value as CeRouting)}>
                    <option value="bgp">{t.ceRoutingBgp}</option>
                    <option value="ospf">{t.ceRoutingOspf}</option>
                    <option value="static">{t.ceRoutingStatic}</option>
                  </select>
                </div>
                <button onClick={addSite} className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-600 transition-colors">
                  <Plus size={14} />{t.addSite}
                </button>
                {sites.length === 0 ? <p className="text-sm text-zinc-400 text-center py-2">{t.noSites}</p> : (
                  <div className="space-y-2">
                    {sites.map(site => (
                      <div key={site.id} className="flex items-center gap-2 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 px-3 py-2">
                        <div className="flex-1">
                          <div className="text-sm font-medium">{site.name}</div>
                          <div className="text-xs text-zinc-400">{site.pe} &rarr; {site.ce} ({site.routing.toUpperCase()})</div>
                        </div>
                        <button onClick={() => removeSite(site.id)} className="text-zinc-400 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Vendor + Generate */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-3">
                <h2 className="font-semibold">{t.vendor}</h2>
                <div className="flex gap-2">
                  {(['cisco', 'juniper'] as Vendor[]).map(v => (
                    <button key={v} onClick={() => setVendor(v)} className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${vendor === v ? 'bg-blue-500 text-white border-blue-500' : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>{v}</button>
                  ))}
                </div>
                <button onClick={generate} className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-3 text-sm font-medium text-white hover:bg-blue-600 transition-colors">
                  <Network size={16} />{t.generateConfig}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {/* Topology */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-3">
                <h2 className="font-semibold">{t.topology}</h2>
                <div className="space-y-2">
                  {sites.map(site => (
                    <div key={site.id} className="flex items-center gap-2 text-sm">
                      <div className="px-2 py-1 rounded bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 text-xs font-medium">{site.pe}</div>
                      <span className="text-zinc-400">----- VRF {vpnName} -----</span>
                      <div className="px-2 py-1 rounded bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 text-xs font-medium">{site.ce}</div>
                      <span className="text-xs text-zinc-400">({site.routing.toUpperCase()})</span>
                    </div>
                  ))}
                  {sites.length > 1 && (
                    <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-400">
                      MP-BGP (VPNv4) between all PEs via Route Reflector<br />
                      RD: <span className="font-mono text-blue-500">{rd}</span> | RT: <span className="font-mono text-green-500">{rtExport}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Output */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{t.output}</h2>
                  {config && (
                    <button onClick={handleCopy} className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                      {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                      {copied ? t.copied : t.copy}
                    </button>
                  )}
                </div>
                {config ? (
                  <pre className="rounded-lg bg-zinc-950 text-zinc-100 p-4 text-xs font-mono whitespace-pre overflow-x-auto leading-relaxed max-h-96">{config}</pre>
                ) : (
                  <div className="rounded-lg border-2 border-dashed border-zinc-200 dark:border-zinc-700 p-8 text-center text-sm text-zinc-400">{t.noConfig}</div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
            <h2 className="font-semibold mb-3">{t.references}</h2>
            <ul className="space-y-1">
              {t.refList.map(ref => (
                <li key={ref} className="text-sm text-zinc-500 dark:text-zinc-400 flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>{ref}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>

      <footer className="border-t border-zinc-200 dark:border-zinc-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-zinc-400">
          <span>{t.builtBy} <a href="https://github.com/gmowses" className="text-zinc-600 dark:text-zinc-300 hover:text-blue-500 transition-colors">Gabriel Mowses</a></span>
          <span>MIT License</span>
        </div>
      </footer>
    </div>
  )
}
