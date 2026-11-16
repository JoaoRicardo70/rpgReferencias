import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useStore from '../../stores/useStore';
import { salvarDummie, salvarCamposPersonagem, salvarFichaSilencioso } from '../../services/firebase-sync';
import { salvarRacasDaMesa, definirRacaDoPersonagemDireto } from '../../services/racasMesa';
import useSecaoMestre, { domDaSecaoMestre } from './useSecaoMestre';
import {
    getRacas, gerarIdRaca, resolverRaca, ehHabilidadeDeRaca, limparReferenciasDeRaca,
    LIMITE_RACAS, LIMITE_NOME_RACA, LIMITE_APELIDOS_RACA, ICONE_RACA_PADRAO,
} from '../../core/racas';

// 🧬 RAÇAS DA MESA (aba Mestre — só Mestre/Co-Mestre). Edita o catálogo de Raças do cenário (ícone, nome, apelidos, "herda de") e
// mostra de qual Raça é cada personagem. Quem é de qual Raça decide o acesso às Habilidades de Raça (core/racas.js).
// Grava pelo serviço services/racasMesa.js (a mesma regra do Mapa): NÃO depende do Mapa ter sido aberto. Começa ABERTA.
// Nome, ícone e apelidos só gravam ao SAIR do campo (ou no botão "Salvar raças"); adicionar, remover e "herda de" gravam na hora.

const paraRascunho = (r) => ({ id: r.id, icone: r.icone, nome: r.nome, apelidosTexto: (r.apelidos || []).join(', '), herdaDe: r.herdaDe || '' });
const paraLista = (rascunho) => rascunho.map(r => ({
    id: r.id, icone: r.icone, nome: r.nome, herdaDe: r.herdaDe,
    apelidos: String(r.apelidosTexto || '').split(',').map(a => a.trim()).filter(Boolean),
}));
const comoLista = (v) => (Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []));
const entradas = (v) => (Array.isArray(v) ? v.map((p, i) => [String(i), p]) : (v && typeof v === 'object' ? Object.entries(v) : []));

export default function RacasCatalogo() {
    const isMestre = useStore(s => s.isMestre);
    const cenario = useStore(s => s.cenario);
    const resumo = useStore(s => s.resumoTurnoMapa);
    const personagens = useStore(s => s.personagens);
    const dummies = useStore(s => s.dummies);
    const meuNome = useStore(s => s.meuNome);
    const minhaFicha = useStore(s => s.minhaFicha);
    const updateFicha = useStore(s => s.updateFicha);

    const [aberto, setAberto] = useState(true);
    useSecaoMestre('racas', () => setAberto(true));
    const [confirmando, setConfirmando] = useState(null); // id da raça a remover
    const salvas = useMemo(() => getRacas(cenario), [cenario]);
    const chaveSalvas = JSON.stringify(salvas);
    const [rascunho, setRascunho] = useState(() => salvas.map(paraRascunho));
    useEffect(() => {
        setRascunho(salvas.map(paraRascunho));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- chaveSalvas resume salvas
    }, [chaveSalvas]);

    const gravar = useCallback((lista) => { salvarRacasDaMesa(lista); }, []);
    const gravarRascunho = useCallback(() => gravar(paraLista(rascunho)), [gravar, rascunho]);

    const editar = useCallback((id, campo, valor) => {
        setRascunho(r => r.map(x => (x.id === id ? { ...x, [campo]: valor } : x)));
    }, []);
    // Nome vazio no blur NÃO apaga a raça: volta ao nome salvo e nada é gravado.
    const aoSairDoNome = useCallback((id) => {
        const atual = rascunho.find(r => r.id === id);
        if (atual && !String(atual.nome || '').trim()) {
            const salva = salvas.find(r => r.id === id);
            setRascunho(r => r.map(x => (x.id === id ? { ...x, nome: salva ? salva.nome : x.nome } : x)));
            return;
        }
        gravarRascunho();
    }, [rascunho, salvas, gravarRascunho]);
    const adicionar = useCallback(() => {
        if (rascunho.length >= LIMITE_RACAS) return;
        const nova = { id: gerarIdRaca('Nova raça', rascunho), icone: ICONE_RACA_PADRAO, nome: 'Nova raça', apelidosTexto: '', herdaDe: '' };
        const lista = [...rascunho, nova];
        setRascunho(lista);
        gravar(paraLista(lista));
    }, [rascunho, gravar]);
    const mudarHerdaDe = useCallback((id, valor) => {
        const lista = rascunho.map(x => (x.id === id ? { ...x, herdaDe: valor } : x));
        setRascunho(lista);
        gravar(paraLista(lista));
    }, [rascunho, gravar]);

    // Todas as fichas que o Mestre enxerga com seus poderes: [{ chave, nome, isDummie, ficha }].
    const entidades = useMemo(() => {
        const saida = [];
        const nomes = new Set(Object.keys(personagens || {}));
        if (meuNome) nomes.add(meuNome);
        nomes.forEach((id) => {
            const ficha = id === meuNome ? minhaFicha : (personagens || {})[id];
            if (!ficha || typeof ficha !== 'object') return;
            saida.push({ chave: `p:${id}`, id, nome: (ficha.bio && ficha.bio.nome) || id, isDummie: false, ficha });
        });
        const naCena = new Set([...((resumo && resumo.ordem) || []), ...((resumo && resumo.foraDaOrdem) || [])].filter(it => it && it.isDummie).map(it => it.id));
        Object.entries(dummies || {}).forEach(([id, d]) => {
            if (!d || typeof d !== 'object' || !naCena.has(id)) return;
            saida.push({ chave: `d:${id}`, id, nome: d.nome || id, isDummie: true, ficha: d });
        });
        return saida;
    }, [personagens, dummies, meuNome, minhaFicha, resumo]);

    // Quantas Habilidades de Raça (em qualquer ficha da mesa) e quantas raças filhas citam esta raça.
    const referenciasDe = useCallback((idRaca) => {
        let habilidades = 0;
        entidades.forEach((e) => {
            comoLista(e.ficha && e.ficha.poderes).forEach((p) => { if (ehHabilidadeDeRaca(p) && Array.isArray(p.racasAcesso) && p.racasAcesso.includes(idRaca)) habilidades += 1; });
        });
        const filhas = salvas.filter(r => r.herdaDe === idRaca).length;
        return { habilidades, filhas };
    }, [entidades, salvas]);

    // Remove a raça e limpa as referências a ela (herdaDe das filhas e racasAcesso das Habilidades de Raça).
    // As Habilidades das outras fichas são limpas campo a campo (poderes/<posição>/racasAcesso), sem reescrever a lista de poderes inteira.
    const remover = useCallback((idRaca) => {
        setConfirmando(null);
        const poderesSalvos = [];
        entidades.forEach(e => entradas(e.ficha && e.ficha.poderes).forEach(([, p]) => poderesSalvos.push(p)));
        const { racas: restantes } = limparReferenciasDeRaca(idRaca, { racas: salvas, poderes: poderesSalvos });
        gravar(restantes);
        // As fichas são relidas do store NO MOMENTO de gravar (nunca o índice do snapshot antigo): o poder é achado pelo id e, se sumiu, nada é gravado.
        const fresco = useStore.getState();
        const idsComRaca = (ficha) => entradas(ficha && ficha.poderes)
            .filter(([, p]) => ehHabilidadeDeRaca(p) && Array.isArray(p.racasAcesso) && p.racasAcesso.includes(idRaca))
            .map(([chave, p]) => ({ chave, id: p.id }));
        const idsAfetados = entidades.map(e => ({ e, ids: idsComRaca(e.ficha).map(x => x.id) })).filter(x => x.ids.length > 0);
        idsAfetados.forEach(({ e, ids }) => {
            const ficha = e.isDummie ? (fresco.dummies || {})[e.id] : (e.id === fresco.meuNome ? fresco.minhaFicha : (fresco.personagens || {})[e.id]);
            if (!ficha) return;
            const campos = {};
            entradas(ficha.poderes).forEach(([chave, p]) => {
                if (!ehHabilidadeDeRaca(p) || !ids.includes(p.id) || !Array.isArray(p.racasAcesso) || !p.racasAcesso.includes(idRaca)) return;
                campos[`poderes/${chave}/racasAcesso`] = p.racasAcesso.filter(i => i !== idRaca);
            });
            if (Object.keys(campos).length === 0) return;
            if (e.isDummie) {
                const poderes = comoLista(ficha.poderes).map(p => (ehHabilidadeDeRaca(p) && ids.includes(p.id) && Array.isArray(p.racasAcesso) ? { ...p, racasAcesso: p.racasAcesso.filter(i => i !== idRaca) } : p));
                salvarDummie(e.id, { ...ficha, poderes });
            } else if (!e.isDummie && e.id === fresco.meuNome) {
                const upd = fresco.updateFicha || updateFicha;
                if (typeof upd === 'function') upd((f) => { comoLista(f.poderes).forEach((p) => { if (ehHabilidadeDeRaca(p) && ids.includes(p.id) && Array.isArray(p.racasAcesso)) p.racasAcesso = p.racasAcesso.filter(i => i !== idRaca); }); });
                salvarFichaSilencioso();
            } else {
                salvarCamposPersonagem(e.id, campos);
            }
        });
    }, [entidades, salvas, gravar, meuNome, dummies, updateFicha]);

    if (!isMestre) return null;

    const racaDe = (e) => resolverRaca(cenario, e.ficha);

    return (
        <section id={domDaSecaoMestre('racas')} className="equipes-painel racas-painel racas-destaque glass-panel" aria-label="Raças da mesa">
            <button type="button" className="equipes-titulo-btn racas-titulo-btn" onClick={() => setAberto(v => !v)} aria-expanded={aberto} aria-controls="racas-corpo">
                <span aria-hidden="true">{aberto ? '▼' : '▶'}</span> 🧬 Raças
            </button>
            {aberto && (
                <div id="racas-corpo" className="equipes-corpo racas-corpo">
                    <p className="racas-intro">Aqui você cadastra as Raças da mesa. Cada Habilidade de Raça libera acesso por Raça. Como chegar: menu lateral → 👑 Mestre → 🧬 Raças.</p>
                    <p className="equipes-legenda">As Raças cadastradas aqui definem quem tem acesso a cada Habilidade de Raça. Quem herda de outra Raça tem o mesmo acesso que ela. Sem nenhuma Raça cadastrada, o campo Raça das fichas continua livre.</p>

                    <h4 className="equipes-subtitulo">Catálogo de Raças</h4>
                    {rascunho.length === 0 ? (
                        <div className="racas-vazio-destaque" role="status">
                            <p>Nenhuma Raça cadastrada ainda. Cadastre a primeira para liberar o acesso às Habilidades de Raça.</p>
                            <button type="button" className="btn-neon btn-green" onClick={adicionar}>＋ Cadastrar primeira Raça</button>
                        </div>
                    ) : (
                        <ul className="equipes-lista racas-lista">
                            {rascunho.map((r) => {
                                const ref = referenciasDe(r.id);
                                return (
                                    <li key={r.id} className="equipes-item racas-item">
                                        <input className="input-neon equipes-input-icone" value={r.icone} maxLength={8} aria-label={`Ícone da raça ${r.nome}`}
                                            onChange={(ev) => editar(r.id, 'icone', ev.target.value)} onBlur={gravarRascunho} />
                                        <input className="input-neon equipes-input-nome" value={r.nome} maxLength={LIMITE_NOME_RACA} aria-label={`Nome da raça ${r.id}`}
                                            onChange={(ev) => editar(r.id, 'nome', ev.target.value)} onBlur={() => aoSairDoNome(r.id)} />
                                        <input className="input-neon racas-input-apelidos" value={r.apelidosTexto} aria-label={`Apelidos da raça ${r.nome}`}
                                            placeholder={`Apelidos, separados por vírgula (até ${LIMITE_APELIDOS_RACA})`}
                                            onChange={(ev) => editar(r.id, 'apelidosTexto', ev.target.value)} onBlur={gravarRascunho} />
                                        <select className="input-neon equipes-select" value={r.herdaDe}
                                            aria-label={`${r.nome} herda de`} onChange={(ev) => mudarHerdaDe(r.id, ev.target.value)}>
                                            <option value="">Não herda de ninguém</option>
                                            {rascunho.filter(o => o.id !== r.id).map(o => <option key={o.id} value={o.id}>Herda de {o.icone} {o.nome}</option>)}
                                        </select>
                                        {confirmando === r.id ? (
                                            <span className="equipes-confirmar racas-confirmar" role="alertdialog" aria-label={`Confirmar remoção de ${r.nome}`}>
                                                Remover a raça {r.nome}?
                                                {' '}{ref.habilidades > 0 ? `${ref.habilidades} Habilidade(s) de Raça e ` : ''}{ref.filhas > 0 ? `${ref.filhas} raça(s) filha(s) ` : ''}
                                                {ref.habilidades + ref.filhas > 0 ? 'citam esta raça: as referências serão limpas. Nenhuma habilidade é apagada; quem era dessa raça passa a ter selo de Raça incompatível.' : 'Nenhuma Habilidade de Raça cita esta raça. Quem era dela passa a ter selo de Raça incompatível nas habilidades que ela dava acesso.'}
                                                {' '}Outro Mestre editando ao mesmo tempo pode sobrescrever o catálogo.
                                                <button type="button" className="btn-neon btn-red equipes-btn" onClick={() => remover(r.id)}>Sim, remover</button>
                                                <button type="button" className="btn-neon equipes-btn" onClick={() => setConfirmando(null)}>Cancelar</button>
                                            </span>
                                        ) : (
                                            <button type="button" className="btn-neon btn-red equipes-btn" onClick={() => setConfirmando(r.id)} aria-label={`Remover raça ${r.nome}`}>🗑️ Remover</button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    <div className="equipes-acoes">
                        <button type="button" className="btn-neon btn-green equipes-btn" onClick={adicionar} disabled={rascunho.length >= LIMITE_RACAS}
                            title={rascunho.length >= LIMITE_RACAS ? `Limite de ${LIMITE_RACAS} raças` : 'Cria uma nova raça'}>➕ Adicionar raça</button>
                        <button type="button" className="btn-neon equipes-btn" onClick={gravarRascunho}>💾 Salvar raças</button>
                    </div>

                    <h4 className="equipes-subtitulo">Quem é de qual raça</h4>
                    {entidades.length === 0 ? <p className="equipes-vazio">Ninguém na mesa ainda.</p> : (
                        <ul className="equipes-membros racas-membros">
                            {entidades.map((e) => {
                                const raca = racaDe(e);
                                return (
                                    <li key={e.chave} className="equipes-membro racas-membro">
                                        <span className="equipes-membro-nome">{e.isDummie ? '👾 ' : ''}{e.nome}</span>
                                        <select className="input-neon equipes-select" value={raca.cadastrada ? raca.id : ''} disabled={salvas.length === 0}
                                            aria-label={`Raça de ${e.nome}`}
                                            onChange={(ev) => definirRacaDoPersonagemDireto({ id: e.id, nome: e.nome, isDummie: e.isDummie }, ev.target.value)}>
                                            <option value="">{raca.nome && !raca.cadastrada ? `Outra: ${raca.nome}` : 'Sem raça'}</option>
                                            {salvas.map(o => <option key={o.id} value={o.id}>{o.icone} {o.nome}</option>)}
                                        </select>
                                        {!raca.cadastrada && raca.nome && <span className="racas-nao-cadastrada" role="note">⚠️ Raça não cadastrada: &quot;{raca.nome}&quot; (sem acesso a Habilidades de Raça)</span>}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </section>
    );
}
