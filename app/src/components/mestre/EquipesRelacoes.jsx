import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useStore from '../../stores/useStore';
import SeloEquipe from '../shared/SeloEquipe';
import {
    getEquipes, getRelacoes, equipeDe, ladoEstaOculto, relacaoEntreEquipes, definirRelacao, gerarIdEquipe,
    EQUIPES_PADRAO, LIMITE_EQUIPES, LIMITE_NOME_EQUIPE, COR_EQUIPE_PADRAO, ICONE_EQUIPE_PADRAO,
} from '../../core/lados';

// 🛡️ EQUIPES E RELAÇÕES (aba Mestre — só Mestre/Co-Mestre). Edita as equipes nomeadas do cenário, a matriz de relações entre
// pares (aliada/neutra/hostil) e coloca cada combatente da cena numa equipe (com a opção de ocultar o lado dos jogadores).
// Não tem lógica de gravação própria: usa as ações do Mapa (acoesOrdemTurnoMapa → salvarEquipes/salvarRelacoes/definirEquipeDe/alternarLadoOculto).
// Campos de texto só gravam ao SAIR do campo (ou no botão "Salvar equipes"), nunca a cada tecla.

const IDS_PADRAO = EQUIPES_PADRAO.map(e => e.id);
const OPCOES_RELACAO = [
    { valor: 'aliada', rotulo: '🤝 Aliada' },
    { valor: 'neutra', rotulo: '😐 Neutra' },
    { valor: 'hostil', rotulo: '⚔️ Hostil' },
];

export default function EquipesRelacoes() {
    const isMestre = useStore(s => s.isMestre);
    const cenario = useStore(s => s.cenario);
    const acoes = useStore(s => s.acoesOrdemTurnoMapa);
    const resumo = useStore(s => s.resumoTurnoMapa);
    const personagens = useStore(s => s.personagens);
    const dummies = useStore(s => s.dummies);
    const meuNome = useStore(s => s.meuNome);
    const minhaFicha = useStore(s => s.minhaFicha);

    const [aberto, setAberto] = useState(false);
    const [confirmando, setConfirmando] = useState(null); // id da equipe a remover, ou '__restaurar__'
    const equipesSalvas = useMemo(() => getEquipes(cenario), [cenario]);
    const relacoes = useMemo(() => getRelacoes(cenario), [cenario]);
    const chaveSalvas = JSON.stringify(equipesSalvas);
    const [rascunho, setRascunho] = useState(() => equipesSalvas.map(e => ({ ...e })));
    useEffect(() => {
        setRascunho(equipesSalvas.map(e => ({ ...e })));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- chaveSalvas resume equipesSalvas
    }, [chaveSalvas]);

    const podeGravar = !!acoes;

    const gravarEquipes = useCallback((lista) => { if (acoes) acoes.salvarEquipes(lista); }, [acoes]);
    const editarCampo = useCallback((id, campo, valor) => {
        setRascunho(r => r.map(e => (e.id === id ? { ...e, [campo]: valor } : e)));
    }, []);
    // Nome vazio no blur NÃO apaga a equipe: volta ao nome salvo e nada é gravado.
    const aoSairDoNome = useCallback((id) => {
        const atual = rascunho.find(e => e.id === id);
        if (atual && !String(atual.nome || '').trim()) {
            const salvo = equipesSalvas.find(e => e.id === id);
            setRascunho(r => r.map(e => (e.id === id ? { ...e, nome: salvo ? salvo.nome : e.nome } : e)));
            return;
        }
        gravarEquipes(rascunho);
    }, [rascunho, equipesSalvas, gravarEquipes]);
    const adicionar = useCallback(() => {
        if (rascunho.length >= LIMITE_EQUIPES) return;
        const nova = { id: gerarIdEquipe('Nova equipe', rascunho), nome: 'Nova equipe', cor: COR_EQUIPE_PADRAO, icone: ICONE_EQUIPE_PADRAO };
        const lista = [...rascunho, nova];
        setRascunho(lista);
        gravarEquipes(lista);
    }, [rascunho, gravarEquipes]);
    const remover = useCallback((id) => {
        const lista = rascunho.filter(e => e.id !== id);
        setConfirmando(null);
        gravarEquipes(lista);
    }, [rascunho, gravarEquipes]);
    const restaurar = useCallback(() => { setConfirmando(null); gravarEquipes([]); }, [gravarEquipes]);
    const mudarRelacao = useCallback((a, b, valor) => {
        if (acoes) acoes.salvarRelacoes(definirRelacao(relacoes, a, b, valor));
    }, [acoes, relacoes]);

    // Combatentes da cena exibida no Mapa (ordem + fora da ordem), com a ficha/dummie fresca da store.
    const combatentes = useMemo(() => {
        const itens = [...((resumo && resumo.ordem) || []), ...((resumo && resumo.foraDaOrdem) || [])];
        const vistos = new Set();
        return itens.map((it) => {
            const chave = `${it.isDummie ? 'd' : 'p'}:${it.id}`;
            if (vistos.has(chave)) return null;
            vistos.add(chave);
            const dados = it.isDummie ? (dummies || {})[it.id] : (it.id === meuNome ? minhaFicha : (personagens || {})[it.id]);
            if (!dados) return null;
            return { id: it.id, nome: it.nome, isDummie: !!it.isDummie, chave, ficha: dados };
        }).filter(Boolean);
    }, [resumo, dummies, personagens, meuNome, minhaFicha]);

    if (!isMestre) return null;

    const pares = [];
    equipesSalvas.forEach((a, i) => { for (let j = i + 1; j < equipesSalvas.length; j += 1) pares.push([a, equipesSalvas[j]]); });

    return (
        <section className="equipes-painel glass-panel" aria-label="Equipes e Relações">
            <button type="button" className="equipes-titulo-btn" onClick={() => setAberto(v => !v)} aria-expanded={aberto} aria-controls="equipes-corpo">
                <span aria-hidden="true">{aberto ? '▼' : '▶'}</span> 🛡️ Equipes e Relações
            </button>
            {aberto && (
                <div id="equipes-corpo" className="equipes-corpo">
                    {!podeGravar && <p className="equipes-aviso" role="note">Abra o Mapa uma vez para liberar a edição (as ações de combate vivem lá).</p>}

                    <h4 className="equipes-subtitulo">Equipes</h4>
                    <ul className="equipes-lista">
                        {rascunho.map((e) => {
                            const padrao = IDS_PADRAO.includes(e.id);
                            return (
                                <li key={e.id} className="equipes-item" style={{ '--lado-cor': e.cor }}>
                                    <input className="input-neon equipes-input-icone" value={e.icone} maxLength={8} aria-label={`Ícone da equipe ${e.nome}`}
                                        onChange={(ev) => editarCampo(e.id, 'icone', ev.target.value)} onBlur={() => gravarEquipes(rascunho)} disabled={!podeGravar} />
                                    <input className="input-neon equipes-input-nome" value={e.nome} maxLength={LIMITE_NOME_EQUIPE} aria-label={`Nome da equipe ${e.id}`}
                                        onChange={(ev) => editarCampo(e.id, 'nome', ev.target.value)} onBlur={() => aoSairDoNome(e.id)} disabled={!podeGravar} />
                                    <input type="color" className="equipes-input-cor" value={e.cor} aria-label={`Cor da equipe ${e.nome}`}
                                        onChange={(ev) => editarCampo(e.id, 'cor', ev.target.value)} onBlur={() => gravarEquipes(rascunho)} disabled={!podeGravar} />
                                    {padrao ? (
                                        <span className="equipes-padrao" title="Equipe padrão: não pode ser removida">padrão</span>
                                    ) : confirmando === e.id ? (
                                        <span className="equipes-confirmar" role="alertdialog" aria-label={`Confirmar remoção de ${e.nome}`}>
                                            Remover esta equipe?
                                            <button type="button" className="btn-neon btn-red equipes-btn" onClick={() => remover(e.id)}>Sim, remover</button>
                                            <button type="button" className="btn-neon equipes-btn" onClick={() => setConfirmando(null)}>Cancelar</button>
                                        </span>
                                    ) : (
                                        <button type="button" className="btn-neon btn-red equipes-btn" onClick={() => setConfirmando(e.id)} disabled={!podeGravar} aria-label={`Remover equipe ${e.nome}`}>🗑️ Remover</button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                    <div className="equipes-acoes">
                        <button type="button" className="btn-neon btn-green equipes-btn" onClick={adicionar} disabled={!podeGravar || rascunho.length >= LIMITE_EQUIPES}
                            title={rascunho.length >= LIMITE_EQUIPES ? `Limite de ${LIMITE_EQUIPES} equipes` : 'Cria uma nova equipe'}>➕ Adicionar equipe</button>
                        <button type="button" className="btn-neon equipes-btn" onClick={() => gravarEquipes(rascunho)} disabled={!podeGravar}>💾 Salvar equipes</button>
                        {confirmando === '__restaurar__' ? (
                            <span className="equipes-confirmar" role="alertdialog" aria-label="Confirmar restauração do padrão">
                                Apagar as equipes e relações personalizadas?
                                <button type="button" className="btn-neon btn-red equipes-btn" onClick={restaurar}>Sim, restaurar</button>
                                <button type="button" className="btn-neon equipes-btn" onClick={() => setConfirmando(null)}>Cancelar</button>
                            </span>
                        ) : (
                            <button type="button" className="btn-neon equipes-btn" onClick={() => setConfirmando('__restaurar__')} disabled={!podeGravar}>↩️ Restaurar padrão</button>
                        )}
                    </div>

                    <h4 className="equipes-subtitulo">Relações entre equipes</h4>
                    <p className="equipes-legenda">🤝 Aliada: ajudam-se · 😐 Neutra: não se atacam por padrão · ⚔️ Hostil: são inimigas. Dentro da mesma equipe a relação é sempre aliada.</p>
                    {pares.length === 0 ? <p className="equipes-vazio">Crie ao menos duas equipes para definir relações.</p> : (
                        <ul className="equipes-matriz">
                            {pares.map(([a, b]) => (
                                <li key={`${a.id}|${b.id}`} className="equipes-par">
                                    <span className="equipes-par-nome">{a.icone} {a.nome} <span aria-hidden="true">↔</span> {b.icone} {b.nome}</span>
                                    <select className="input-neon equipes-select" value={relacaoEntreEquipes(cenario, a.id, b.id)} disabled={!podeGravar}
                                        aria-label={`Relação entre ${a.nome} e ${b.nome}`} onChange={(ev) => mudarRelacao(a.id, b.id, ev.target.value)}>
                                        {OPCOES_RELACAO.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                                    </select>
                                </li>
                            ))}
                        </ul>
                    )}

                    <h4 className="equipes-subtitulo">Quem está em qual equipe</h4>
                    {combatentes.length === 0 ? <p className="equipes-vazio">Ninguém na cena exibida do Mapa.</p> : (
                        <ul className="equipes-membros">
                            {combatentes.map((c) => {
                                const oculto = ladoEstaOculto(c);
                                return (
                                    <li key={c.chave} className="equipes-membro">
                                        <SeloEquipe cenario={cenario} entidade={c} isMestre />
                                        <span className="equipes-membro-nome">{c.isDummie ? '👾 ' : ''}{c.nome}</span>
                                        <select className="input-neon equipes-select" value={equipeDe(c, cenario)} disabled={!podeGravar}
                                            aria-label={`Equipe de ${c.nome}`} onChange={(ev) => acoes && acoes.definirEquipeDe({ id: c.id, nome: c.nome, isDummie: c.isDummie }, ev.target.value)}>
                                            {equipesSalvas.map(e => <option key={e.id} value={e.id}>{e.icone} {e.nome}</option>)}
                                        </select>
                                        <button type="button" className="btn-neon equipes-btn" disabled={!podeGravar} aria-pressed={oculto}
                                            title={oculto ? 'O lado está oculto dos jogadores: clique para revelar' : 'O lado está visível: clique para ocultar dos jogadores'}
                                            onClick={() => acoes && acoes.alternarLadoOculto({ id: c.id, nome: c.nome, isDummie: c.isDummie })}>
                                            {oculto ? '🙈 Oculto — revelar' : '👁️ Revelado — ocultar'}
                                        </button>
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
