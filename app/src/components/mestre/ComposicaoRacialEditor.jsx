import React, { useCallback, useEffect, useMemo, useState, useId } from 'react';
import useStore from '../../stores/useStore';
import SeletorVisibilidadeRaca from '../shared/SeletorVisibilidadeRaca';
import {
    definirComposicaoRacial, concederPraticaRacial, adicionarRacaAdquirida, removerRacaDaComposicao,
} from '../../services/composicaoRacial';
import {
    getRacas, getComposicaoRacial, temComposicaoExplicita, resolverRaca,
    PERCENTUAL_RACA_ADQUIRIDA_PADRAO, LIMITE_COMPOSICAO_RACIAL,
} from '../../core/racas';

// 🧬 Composição Racial de UM personagem (só Mestre/Co-Mestre). Mestiços: cada Raça tem um percentual próprio (0-100, independentes, sobem com a prática).
// Linhas = Raças da composição; "＋ Prática" soma pontos e registra no histórico; "＋ Adicionar Raça" (nativa ou adquirida, padrão 10%); remover.
// Percentual só grava ao SAIR do campo (ou em "💾 Salvar composição"); adicionar, remover e prática gravam na hora. Quem grava é services/composicaoRacial.js.
// entidade = { id, nome }; ficha = a ficha dessa entidade (para ler a composição e o histórico).

const LIMITE_INICIAL_HISTORICO = 10;
const LIMITE_MAXIMO_HISTORICO = 50;
const PRATICAS_RAPIDAS = [1, 5, 10];
const comoLista = (v) => (Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []));
const formatarData = (ts) => {
    if (!ts) return '';
    try { return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
};
const sinal = (n) => (n > 0 ? `+${n}` : String(n));
const paraRascunho = (comp) => comp.map(e => ({ racaId: e.racaId, percentual: String(e.percentual), origem: e.origem, fonte: e.fonte || '' }));

export default function ComposicaoRacialEditor({ entidade, ficha, rotulo = '🧬 Composição', inicialAberto = false }) {
    const isMestre = useStore(s => s.isMestre);
    const cenario = useStore(s => s.cenario);
    const [aberto, setAberto] = useState(inicialAberto);
    const idCorpo = useId();
    const racas = useMemo(() => getRacas(cenario), [cenario]);
    const composicao = useMemo(() => getComposicaoRacial(cenario, ficha), [cenario, ficha]);
    const chave = JSON.stringify(composicao);
    const [rascunho, setRascunho] = useState(() => paraRascunho(composicao));
    useEffect(() => { setRascunho(paraRascunho(composicao)); /* eslint-disable-next-line react-hooks/exhaustive-deps -- chave resume composicao */ }, [chave]);
    const [mensagem, setMensagem] = useState(null); // { ok, texto }
    const [praticando, setPraticando] = useState(null); // racaId com o mini-formulário de prática aberto
    const [praticaValor, setPraticaValor] = useState('');
    const [praticaMotivo, setPraticaMotivo] = useState('');
    const [novaRaca, setNovaRaca] = useState('');
    const [novaOrigem, setNovaOrigem] = useState('adquirida');
    const [novoPercentual, setNovoPercentual] = useState(String(PERCENTUAL_RACA_ADQUIRIDA_PADRAO));
    const [historicoMax, setHistoricoMax] = useState(LIMITE_INICIAL_HISTORICO);

    const nomeDa = useCallback((id) => { const r = racas.find(x => x.id === id); return r ? `${r.icone} ${r.nome}` : id; }, [racas]);
    const principal = useMemo(() => resolverRaca(cenario, ficha), [cenario, ficha]);
    const principalFora = temComposicaoExplicita(ficha) && principal.cadastrada && !composicao.some(e => e.racaId === principal.id);
    const livres = useMemo(() => racas.filter(r => !composicao.some(e => e.racaId === r.id)), [racas, composicao]);
    const historico = useMemo(() => comoLista(ficha && ficha.bio && ficha.bio.composicaoRacialHistorico).filter(Boolean).slice().reverse(), [ficha]);

    const mostrar = useCallback((r, textoOk) => {
        setMensagem(r && r.ok ? { ok: true, texto: textoOk } : { ok: false, texto: (r && r.mensagem) || 'Não foi possível concluir.' });
        return !!(r && r.ok);
    }, []);

    const gravarRascunho = useCallback(() => {
        const lista = rascunho.map(l => ({ racaId: l.racaId, percentual: l.percentual === '' ? 0 : l.percentual, origem: l.origem, fonte: l.fonte }));
        // Nada mudou desde a composição salva: não grava (evita transformar a derivada em explícita só por sair de um campo).
        if (JSON.stringify(paraRascunho(composicao).map(l => [l.racaId, Number(l.percentual)])) === JSON.stringify(lista.map(l => [l.racaId, Number(l.percentual)]))) return;
        mostrar(definirComposicaoRacial(entidade, lista), 'Composição salva.');
    }, [rascunho, composicao, entidade, mostrar]);

    const editarLinha = useCallback((indice, campo, valor) => {
        setRascunho(r => r.map((l, i) => (i === indice ? { ...l, [campo]: valor } : l)));
    }, []);

    // Trocar a Raça de uma linha grava na hora (o percentual e a origem da linha são mantidos).
    const trocarRacaDaLinha = useCallback((indice, novoId) => {
        const lista = rascunho.map((l, i) => ({ racaId: i === indice ? novoId : l.racaId, percentual: l.percentual === '' ? 0 : l.percentual, origem: l.origem, fonte: l.fonte }));
        mostrar(definirComposicaoRacial(entidade, lista), 'Raça da linha trocada.');
    }, [rascunho, entidade, mostrar]);

    const remover = useCallback((racaId) => { mostrar(removerRacaDaComposicao(entidade, racaId), 'Raça removida da composição.'); }, [entidade, mostrar]);

    const conceder = useCallback((racaId, delta) => {
        const ok = mostrar(concederPraticaRacial(entidade, racaId, delta, praticaMotivo), `Prática concedida: ${sinal(Number(delta))}%.`);
        if (ok) { setPraticaValor(''); setPraticaMotivo(''); }
    }, [entidade, praticaMotivo, mostrar]);

    const adicionar = useCallback(() => {
        if (!novaRaca) { setMensagem({ ok: false, texto: 'Escolha a Raça a adicionar.' }); return; }
        const p = novoPercentual === '' ? (novaOrigem === 'adquirida' ? PERCENTUAL_RACA_ADQUIRIDA_PADRAO : 100) : Number(novoPercentual);
        let r;
        if (novaOrigem === 'adquirida') r = adicionarRacaAdquirida(entidade, novaRaca, p, 'Concedida pelo Mestre');
        else r = definirComposicaoRacial(entidade, [...composicao.map(e => ({ racaId: e.racaId, percentual: e.percentual, origem: e.origem, fonte: e.fonte })), { racaId: novaRaca, percentual: p, origem: 'nativa' }]);
        if (mostrar(r, 'Raça adicionada à composição.')) setNovaRaca('');
    }, [novaRaca, novaOrigem, novoPercentual, entidade, composicao, mostrar]);

    const incluirPrincipal = useCallback(() => {
        const lista = [...composicao.map(e => ({ racaId: e.racaId, percentual: e.percentual, origem: e.origem, fonte: e.fonte })), { racaId: principal.id, percentual: 100, origem: 'nativa' }];
        mostrar(definirComposicaoRacial(entidade, lista), 'Raça principal incluída (nativa, 100%).');
    }, [composicao, principal, entidade, mostrar]);

    const mudarOrigemNova = (v) => { setNovaOrigem(v); setNovoPercentual(v === 'adquirida' ? String(PERCENTUAL_RACA_ADQUIRIDA_PADRAO) : '100'); };

    if (!isMestre || !entidade) return null;
    const nome = entidade.nome || entidade.id;

    return (
        <div className="composicao-editor">
            <button type="button" className="btn-neon equipes-btn composicao-toggle" aria-expanded={aberto} aria-controls={idCorpo}
                aria-label={`${rotulo} de ${nome}`} onClick={() => setAberto(v => !v)}>
                <span aria-hidden="true">{aberto ? '▼' : '▶'}</span> {rotulo}
            </button>
            {aberto && (
                <div id={idCorpo} className="composicao-corpo" role="group" aria-label={`Composição racial de ${nome}`}>
                    <p className="composicao-dica">Cada Raça tem o seu percentual (0 a 100). Eles são independentes e sobem com a prática. O Domínio da Raça é o próprio percentual. A visibilidade define quem vê cada Raça: Pública (todos), Privada (dono e Mestre) ou Secreta (só o Mestre; o jogador vê "Raça desconhecida").</p>
                    {principalFora && (
                        <p className="composicao-aviso" role="note">
                            ⚠️ A Raça principal ({nomeDa(principal.id)}) não está na composição.{' '}
                            <button type="button" className="btn-neon equipes-btn" onClick={incluirPrincipal}>Incluir a Raça principal</button>
                        </p>
                    )}
                    {composicao.length === 0 ? <p className="equipes-vazio">Sem Raça na composição. Defina a Raça principal ou adicione uma abaixo.</p> : (
                        <ul className="composicao-linhas">
                            {rascunho.map((l, i) => (
                                <li key={l.racaId || `nova-${i}`} className="composicao-linha">
                                    <select className="input-neon equipes-select composicao-raca" value={l.racaId} aria-label={`Raça da linha ${i + 1} de ${nome}`}
                                        onChange={(ev) => trocarRacaDaLinha(i, ev.target.value)}>
                                        {racas.filter(o => o.id === l.racaId || !composicao.some(e => e.racaId === o.id)).map(o => <option key={o.id} value={o.id}>{o.icone} {o.nome}</option>)}
                                    </select>
                                    <input type="number" min={0} max={100} step={1} className="input-neon composicao-input-percentual" value={l.percentual}
                                        aria-label={`Percentual de ${nome} em ${(racas.find(r => r.id === l.racaId) || {}).nome || l.racaId}`}
                                        onChange={(ev) => editarLinha(i, 'percentual', ev.target.value)} onBlur={gravarRascunho} />
                                    <span className="composicao-percent-simbolo" aria-hidden="true">%</span>
                                    <span className={`composicao-origem composicao-origem--${l.origem}`}>{l.origem === 'adquirida' ? '🧪 Adquirida' : '🌱 Nativa'}</span>
                                    {l.fonte ? <span className="composicao-fonte" title="Origem registrada">{l.fonte}</span> : null}
                                    <span className="composicao-barra composicao-barra--linha" aria-hidden="true"><span className="composicao-barra-cheia" style={{ width: `${Math.min(100, Math.max(0, Number(l.percentual) || 0))}%` }} /></span>
                                    {l.racaId && <SeletorVisibilidadeRaca entidade={entidade} chave={l.racaId} ficha={ficha} souMestre nomeRaca={(racas.find(r => r.id === l.racaId) || {}).nome || l.racaId} />}
                                    <button type="button" className="btn-neon equipes-btn" aria-expanded={praticando === l.racaId}
                                        aria-label={`＋ Prática em ${(racas.find(r => r.id === l.racaId) || {}).nome || l.racaId}`}
                                        onClick={() => { setPraticando(praticando === l.racaId ? null : l.racaId); setPraticaValor(''); }}>＋ Prática</button>
                                    <button type="button" className="btn-neon btn-red equipes-btn" aria-label={`Remover ${(racas.find(r => r.id === l.racaId) || {}).nome || l.racaId} da composição`}
                                        onClick={() => remover(l.racaId)}>🗑️ Remover</button>
                                    {praticando === l.racaId && (
                                        <div className="composicao-pratica" role="group" aria-label={`Conceder prática em ${(racas.find(r => r.id === l.racaId) || {}).nome || l.racaId}`}>
                                            {PRATICAS_RAPIDAS.map(v => (
                                                <button key={v} type="button" className="btn-neon equipes-btn" onClick={() => conceder(l.racaId, v)}>+{v}%</button>
                                            ))}
                                            <input type="number" step={1} className="input-neon composicao-input-percentual" value={praticaValor} placeholder="±%"
                                                aria-label="Pontos de prática (livre)" onChange={(ev) => setPraticaValor(ev.target.value)} />
                                            <button type="button" className="btn-neon btn-green equipes-btn" disabled={praticaValor === ''} onClick={() => conceder(l.racaId, Number(praticaValor))}>Aplicar</button>
                                            <input type="text" maxLength={200} className="input-neon composicao-input-motivo" value={praticaMotivo} placeholder="Motivo (opcional)"
                                                aria-label="Motivo da prática" onChange={(ev) => setPraticaMotivo(ev.target.value)} />
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="composicao-adicionar" role="group" aria-label="Adicionar Raça à composição">
                        <select className="input-neon equipes-select" value={novaRaca} aria-label="Raça a adicionar" onChange={(ev) => setNovaRaca(ev.target.value)}>
                            <option value="">Escolha uma Raça…</option>
                            {livres.map(r => <option key={r.id} value={r.id}>{r.icone} {r.nome}</option>)}
                        </select>
                        <select className="input-neon equipes-select" value={novaOrigem} aria-label="Origem da nova Raça" onChange={(ev) => mudarOrigemNova(ev.target.value)}>
                            <option value="adquirida">Adquirida (começa em {PERCENTUAL_RACA_ADQUIRIDA_PADRAO}%)</option>
                            <option value="nativa">Nativa</option>
                        </select>
                        <input type="number" min={0} max={100} step={1} className="input-neon composicao-input-percentual" value={novoPercentual}
                            aria-label="Percentual inicial da nova Raça" onChange={(ev) => setNovoPercentual(ev.target.value)} />
                        <button type="button" className="btn-neon btn-green equipes-btn" onClick={adicionar} disabled={composicao.length >= LIMITE_COMPOSICAO_RACIAL || racas.length === 0}>＋ Adicionar Raça</button>
                        <button type="button" className="btn-neon equipes-btn" onClick={gravarRascunho}>💾 Salvar composição</button>
                    </div>

                    {mensagem && <p className={`composicao-mensagem${mensagem.ok ? '' : ' composicao-mensagem--erro'}`} role="status">{mensagem.texto}</p>}

                    <h5 className="composicao-historico-titulo">Histórico de prática</h5>
                    {historico.length === 0 ? <p className="equipes-vazio">Nenhum registro ainda.</p> : (
                        <>
                            <ul className="composicao-historico" aria-label={`Histórico de ${nome}`}>
                                {historico.slice(0, historicoMax).map((h, i) => (
                                    <li key={`${h.ts}-${i}`} className="composicao-historico-item">
                                        <span className="composicao-historico-data">{formatarData(h.ts)}</span>{' '}
                                        {nomeDa(h.racaId)}: {h.de}% → {h.para}% ({sinal(h.delta)}){h.motivo ? ` — ${h.motivo}` : ''}
                                    </li>
                                ))}
                            </ul>
                            {historico.length > historicoMax && historicoMax < LIMITE_MAXIMO_HISTORICO && (
                                <button type="button" className="btn-neon equipes-btn" onClick={() => setHistoricoMax(LIMITE_MAXIMO_HISTORICO)}>Ver mais</button>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
