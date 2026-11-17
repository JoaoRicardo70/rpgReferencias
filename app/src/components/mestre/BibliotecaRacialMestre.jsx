import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useStore from '../../stores/useStore';
import useSecaoMestre, { domDaSecaoMestre } from './useSecaoMestre';
import BotaoConcederHabilidade from './BotaoConcederHabilidade';
import RacasAcessoCampo from '../poderes/RacasAcessoCampo';
import { atualizarEntradaDaBiblioteca, removerDaBiblioteca } from '../../services/bibliotecaRacial';
import {
    getBiblioteca, entidadesDaMesa, personagensCompativeis, textoDominio,
    LIMITE_BIBLIOTECA, LIMITE_NOME_BIBLIOTECA, LIMITE_RESUMO_BIBLIOTECA, LIMITE_REQUISITO_BIBLIOTECA, LIMITE_ICONE_INPUT,
    normalizarIconeBiblioteca, normalizarTextoBiblioteca, normalizarPercentualBiblioteca,
} from '../../core/bibliotecaRacial';
import { getRacas } from '../../core/racas';

// 📚 BIBLIOTECA DE HABILIDADES DE RAÇA (aba Mestre → 🧬 Raças — só Mestre/Co-Mestre). O Mestre cria a Habilidade uma vez (no Grimório) e a publica aqui
// com as Raças que têm acesso; cada personagem dessas Raças a vê como "disponível" e o Mestre CONCEDE a cópia ("✨ Conceder").
// Editar/remover uma entrada NÃO muda as cópias já concedidas. Grava por services/bibliotecaRacial.js (não depende do Mapa).
// Nome, resumo, ícone, mínimo e requisito gravam ao SAIR do campo; Raças com acesso gravam na hora. Começa aberta quando a biblioteca está vazia.

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const paraRascunho = (e) => ({ nome: e.nome, resumo: e.resumo, icone: e.icone, percentualMinimo: String(e.percentualMinimo || 0), requisito: e.requisito || '' });

function CompativeisDaEntrada({ entrada, cenario, entidades, aoResultado }) {
    const [busca, setBusca] = useState('');
    const lista = useMemo(() => personagensCompativeis(cenario, entidades, entrada), [cenario, entidades, entrada]);
    const termo = semAcento(busca);
    const filtrada = termo ? lista.filter(p => semAcento(p.nome).includes(termo)) : lista;
    return (
        <div className="biblioteca-compativeis" role="group" aria-label={`Personagens compatíveis com ${entrada.nome}`}>
            <h5 className="biblioteca-subtitulo">Personagens compatíveis <span className="racas-membros-contador">({lista.length})</span></h5>
            {lista.length === 0 ? <p className="equipes-vazio">Ninguém na mesa tem uma Raça com acesso a esta habilidade.</p> : (
                <>
                    {lista.length > 4 && (
                        <label className="racas-busca">Buscar personagem
                            <input type="search" className="input-neon" value={busca} placeholder="Nome do personagem" aria-label={`Buscar personagem para ${entrada.nome}`}
                                onChange={(ev) => setBusca(ev.target.value)} />
                        </label>
                    )}
                    <ul className="biblioteca-compativeis-lista">
                        {filtrada.map(p => (
                            <li key={p.chave} className="biblioteca-compativel">
                                <span className="biblioteca-compativel-nome">{p.isDummie ? '👾 ' : ''}{p.nome}</span>
                                <span className="biblioteca-compativel-raca">{p.racaIcone} {p.racaNome}</span>
                                <span className="biblioteca-compativel-dominio">{textoDominio(p.situacao) || ''}</span>
                                {p.situacao.jaPossui
                                    ? <span className="habilidade-raca-selo habilidade-raca-selo--excecao">Já possui</span>
                                    : <BotaoConcederHabilidade entrada={entrada} entidade={{ id: p.id, nome: p.nome, isDummie: p.isDummie }} aoResultado={aoResultado} />}
                            </li>
                        ))}
                    </ul>
                    {filtrada.length === 0 && <p className="equipes-vazio" role="status">Nenhum personagem encontrado para essa busca.</p>}
                </>
            )}
        </div>
    );
}

export default function BibliotecaRacialMestre() {
    const isMestre = useStore(s => s.isMestre);
    const cenario = useStore(s => s.cenario);
    const resumo = useStore(s => s.resumoTurnoMapa);
    const personagens = useStore(s => s.personagens);
    const dummies = useStore(s => s.dummies);
    const meuNome = useStore(s => s.meuNome);
    const minhaFicha = useStore(s => s.minhaFicha);

    const biblioteca = useMemo(() => getBiblioteca(cenario), [cenario]);
    const racas = useMemo(() => getRacas(cenario), [cenario]);
    const entidades = useMemo(() => entidadesDaMesa({ personagens, dummies, meuNome, minhaFicha, resumo }), [personagens, dummies, meuNome, minhaFicha, resumo]);

    const [abertoEscolha, setAbertoEscolha] = useState(null); // null = automático (aberta se vazia)
    useSecaoMestre('biblioteca', () => setAbertoEscolha(true));
    const [editando, setEditando] = useState(null);
    const [rascunho, setRascunho] = useState(null);
    const [confirmando, setConfirmando] = useState(null);
    const [compatAbertos, setCompatAbertos] = useState({});
    const [mensagem, setMensagem] = useState(null);

    const aberto = abertoEscolha === null ? biblioteca.length === 0 : abertoEscolha;

    // Se a entrada em edição some (outro Mestre removeu), sai do modo edição.
    useEffect(() => {
        if (editando && !biblioteca.some(e => e.id === editando)) { setEditando(null); setRascunho(null); }
    }, [biblioteca, editando]);

    const aoResultado = useCallback((r) => setMensagem(r), []);
    const iniciarEdicao = useCallback((e) => { setEditando(e.id); setRascunho(paraRascunho(e)); }, []);
    const fecharEdicao = useCallback(() => { setEditando(null); setRascunho(null); }, []);

    // Grava o que mudou em relação à entrada salva (nome vazio volta ao nome salvo e nada é gravado).
    const gravarCampos = useCallback((entrada) => {
        if (!rascunho) return;
        const nomeLimpo = normalizarTextoBiblioteca(rascunho.nome, LIMITE_NOME_BIBLIOTECA);
        if (!nomeLimpo) { setRascunho(r => ({ ...r, nome: entrada.nome })); return; }
        // Compara o rascunho NORMALIZADO com o salvo (mesmas regras do core): espaço extra, emoji composto ou arredondamento não geram gravação vazia.
        const patch = {};
        if (nomeLimpo !== entrada.nome) patch.nome = nomeLimpo;
        if (normalizarTextoBiblioteca(rascunho.resumo, LIMITE_RESUMO_BIBLIOTECA) !== entrada.resumo) patch.resumo = rascunho.resumo;
        if (normalizarIconeBiblioteca(rascunho.icone) !== entrada.icone) patch.icone = rascunho.icone;
        const minimo = normalizarPercentualBiblioteca(rascunho.percentualMinimo === '' ? 0 : rascunho.percentualMinimo);
        if (minimo !== entrada.percentualMinimo) patch.percentualMinimo = minimo;
        if (normalizarTextoBiblioteca(rascunho.requisito, LIMITE_REQUISITO_BIBLIOTECA) !== entrada.requisito) patch.requisito = rascunho.requisito;
        if (Object.keys(patch).length === 0) return;
        const r = atualizarEntradaDaBiblioteca(entrada.id, patch);
        setMensagem(r.ok ? { ok: true, mensagem: `"${entrada.nome}" atualizada. As cópias já concedidas não mudam.${r.aviso ? ` ${r.aviso}` : ''}` } : { ok: false, mensagem: r.mensagem });
    }, [rascunho]);

    const mudarRacas = useCallback((entrada, ids) => {
        const r = atualizarEntradaDaBiblioteca(entrada.id, { racasAcesso: ids });
        setMensagem(r.ok ? { ok: true, mensagem: 'Raças com acesso atualizadas. As cópias já concedidas não mudam.' } : { ok: false, mensagem: r.mensagem });
    }, []);

    const remover = useCallback((entrada) => {
        setConfirmando(null);
        const r = removerDaBiblioteca(entrada.id);
        setMensagem(r.ok ? { ok: true, mensagem: `"${entrada.nome}" saiu da biblioteca. Quem já recebeu continua com a habilidade.` } : { ok: false, mensagem: r.mensagem });
    }, []);

    if (!isMestre) return null;

    const nomesRacas = (e) => (e.racasAcesso || []).map(id => racas.find(r => r.id === id)).filter(Boolean);

    return (
        <section id={domDaSecaoMestre('biblioteca')} className="equipes-painel racas-painel biblioteca-painel glass-panel ativo" aria-label="Biblioteca de Habilidades de Raça">
            <button type="button" className="equipes-titulo-btn racas-titulo-btn" onClick={() => setAbertoEscolha(!aberto)} aria-expanded={aberto} aria-controls="biblioteca-corpo">
                <span aria-hidden="true">{aberto ? '▼' : '▶'}</span> 📚 Biblioteca de Habilidades de Raça <span className="racas-membros-contador">({biblioteca.length}/{LIMITE_BIBLIOTECA})</span>
            </button>
            {aberto && (
                <div id="biblioteca-corpo" className="equipes-corpo racas-corpo">
                    <p className="racas-intro">Crie a Habilidade de Raça uma vez no Grimório (aba 🧬 Habilidades de Raça), publique aqui com &quot;📚 Publicar na biblioteca&quot; e conceda a cada personagem da Raça. Editar ou remover aqui não muda quem já recebeu.</p>
                    {mensagem && <p className={`composicao-mensagem${mensagem.ok ? '' : ' composicao-mensagem--erro'}`} role="status">{mensagem.mensagem}</p>}
                    {biblioteca.length === 0 ? (
                        <p className="equipes-vazio biblioteca-vazio" role="status">Nenhuma Habilidade de Raça na biblioteca. Crie uma no Grimório (aba 🧬 Habilidades de Raça) e use &apos;📚 Publicar na biblioteca&apos; no cartão.</p>
                    ) : (
                        <ul className="equipes-lista biblioteca-lista">
                            {biblioteca.map((e) => {
                                const emEdicao = editando === e.id && rascunho;
                                const compatAberto = compatAbertos[e.id] === true;
                                return (
                                    <li key={e.id} className="equipes-item biblioteca-item">
                                        <div className="biblioteca-cabecalho">
                                            <span className="biblioteca-icone" aria-hidden="true">{e.icone}</span>
                                            <strong className="biblioteca-nome">{e.nome}</strong>
                                            {e.percentualMinimo > 0 && <span className="habilidade-raca-contagem">mínimo {e.percentualMinimo}%</span>}
                                        </div>
                                        {e.resumo && <p className="biblioteca-resumo">{e.resumo}</p>}
                                        <p className="biblioteca-racas">
                                            {nomesRacas(e).length === 0
                                                ? <em>Nenhuma Raça com acesso (só como exceção)</em>
                                                : nomesRacas(e).map(r => <span key={r.id} className="habilidade-raca-chip marcada">{r.icone} {r.nome}</span>)}
                                        </p>
                                        {e.requisito && <p className="bloqueio-raca-requisito">Requisito: {e.requisito}</p>}

                                        {emEdicao && (
                                            <div className="biblioteca-edicao" role="group" aria-label={`Editar ${e.nome}`}>
                                                <input className="input-neon equipes-input-icone" value={rascunho.icone} maxLength={LIMITE_ICONE_INPUT} aria-label={`Ícone de ${e.nome}`}
                                                    onChange={(ev) => setRascunho(r => ({ ...r, icone: ev.target.value }))} onBlur={() => gravarCampos(e)} />
                                                <input className="input-neon equipes-input-nome" value={rascunho.nome} maxLength={LIMITE_NOME_BIBLIOTECA} aria-label={`Nome de ${e.nome}`}
                                                    onChange={(ev) => setRascunho(r => ({ ...r, nome: ev.target.value }))} onBlur={() => gravarCampos(e)} />
                                                <input className="input-neon biblioteca-input-largo" value={rascunho.resumo} maxLength={LIMITE_RESUMO_BIBLIOTECA} aria-label={`Resumo de ${e.nome}`} placeholder="Resumo curto"
                                                    onChange={(ev) => setRascunho(r => ({ ...r, resumo: ev.target.value }))} onBlur={() => gravarCampos(e)} />
                                                <label className="bloqueio-raca-campo">Percentual mínimo da Raça (%)
                                                    <input type="number" min={0} max={100} step={1} className="input-neon composicao-input-percentual" value={rascunho.percentualMinimo}
                                                        aria-label={`Percentual mínimo de ${e.nome}`}
                                                        onChange={(ev) => setRascunho(r => ({ ...r, percentualMinimo: ev.target.value }))} onBlur={() => gravarCampos(e)} />
                                                </label>
                                                <label className="bloqueio-raca-campo">Requisito para desbloquear
                                                    <input type="text" className="input-neon biblioteca-input-largo" value={rascunho.requisito} maxLength={LIMITE_REQUISITO_BIBLIOTECA} aria-label={`Requisito de ${e.nome}`}
                                                        onChange={(ev) => setRascunho(r => ({ ...r, requisito: ev.target.value }))} onBlur={() => gravarCampos(e)} />
                                                </label>
                                                <RacasAcessoCampo poder={e} cenario={cenario} podeEditar aoMudar={(ids) => mudarRacas(e, ids)} />
                                                <div className="equipes-acoes">
                                                    <button type="button" className="btn-neon btn-green equipes-btn" onClick={() => { gravarCampos(e); fecharEdicao(); }}>💾 Salvar e fechar</button>
                                                </div>
                                            </div>
                                        )}

                                        <div className="equipes-acoes biblioteca-acoes">
                                            {!emEdicao && <button type="button" className="btn-neon equipes-btn" onClick={() => iniciarEdicao(e)} aria-label={`Editar ${e.nome}`}>✏️ Editar</button>}
                                            <button type="button" className="btn-neon equipes-btn" aria-expanded={compatAberto} onClick={() => setCompatAbertos(c => ({ ...c, [e.id]: !compatAberto }))} aria-label={`Personagens compatíveis com ${e.nome}`}>
                                                👥 Personagens compatíveis
                                            </button>
                                            {confirmando === e.id ? (
                                                <span className="equipes-confirmar racas-confirmar" role="alertdialog" aria-label={`Confirmar remoção de ${e.nome}`}>
                                                    Remover &quot;{e.nome}&quot; da biblioteca? Quem já recebeu continua com a habilidade.
                                                    <button type="button" className="btn-neon btn-red equipes-btn" onClick={() => remover(e)}>Sim, remover</button>
                                                    <button type="button" className="btn-neon equipes-btn" onClick={() => setConfirmando(null)}>Cancelar</button>
                                                </span>
                                            ) : (
                                                <button type="button" className="btn-neon btn-red equipes-btn" onClick={() => setConfirmando(e.id)} aria-label={`Remover ${e.nome} da biblioteca`}>🗑️ Remover</button>
                                            )}
                                        </div>
                                        {compatAberto && <CompativeisDaEntrada entrada={e} cenario={cenario} entidades={entidades} aoResultado={aoResultado} />}
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
