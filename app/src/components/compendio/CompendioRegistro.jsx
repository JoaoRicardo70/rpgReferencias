import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useStore, { sanitizarNome } from '../../stores/useStore';
import { iniciarListenerRegistro, definirLiberacao, criarPedido, removerPedido } from '../../services/registro-sync';
import { enviarEnsinamento } from '../../services/ensinar';
import {
    indexarCapacidades, jogadorVeCapacidade, liberacaoDe, montarLiberacao, montarPedido, pedidosPendentes,
    jaPediu, totalPedidosDe, jogadorJaTem, filtrarCapacidades, LIMITE_PEDIDOS_POR_JOGADOR,
} from '../../core/registroCapacidades';

// 📚 REGISTRO DE CAPACIDADES (seção do Compêndio). O catálogo vem das fichas da mesa (core/registroCapacidades.js).
// Mestre/Co-Mestre: vê tudo, escolhe quem enxerga cada item e aprova os pedidos (a aprovação manda uma oferta de ensinamento
// comum ao jogador, que aceita como qualquer outra). Jogador: vê só o que foi liberado a ele e pode solicitar.
const NIVEL_PADRAO_APROVACAO = 50;

function LinhaMestre({ cap, liberacao, jogadores, aoMudar }) {
    const [aberta, setAberta] = useState(false);
    const info = liberacaoDe(liberacao, cap.chave);
    const resumo = info.todos ? '🌍 Todos' : (info.para.length ? `👁️ ${info.para.join(', ')}` : '🔒 Só o Mestre');
    const alternarTodos = () => aoMudar(cap.chave, montarLiberacao({ todos: !info.todos, para: info.para }));
    const alternarJogador = (nome) => {
        const para = info.para.includes(nome) ? info.para.filter(n => n !== nome) : [...info.para, nome];
        aoMudar(cap.chave, montarLiberacao({ todos: false, para }));
    };
    return (
        <div className="registro-item">
            <div className="registro-item-topo">
                <strong>{cap.nome}</strong>
                <span className="registro-tag">{cap.rotuloCategoria}</span>
                <span className="registro-tag registro-dono">{cap.ehNpc ? '👹' : '🧑'} {cap.dono}</span>
                {!cap.copiavel && <span className="registro-tag registro-nao-copia" title="Singularidade não pode ser copiada nem ensinada">🚫 não copiável</span>}
                <span className="registro-resumo">{resumo}</span>
                <button type="button" className="registro-botao" onClick={() => setAberta(v => !v)} aria-expanded={aberta}>{aberta ? 'Fechar' : 'Liberar…'}</button>
            </div>
            {cap.descricao && <p className="registro-desc">{cap.descricao}</p>}
            {aberta && (
                <div className="registro-liberar">
                    <button type="button" className={`registro-chip${info.todos ? ' ativo' : ''}`} onClick={alternarTodos}>🌍 Todos</button>
                    {jogadores.map(n => (
                        <button key={n} type="button" className={`registro-chip${info.todos || info.para.includes(n) ? ' ativo' : ''}`} disabled={info.todos} onClick={() => alternarJogador(n)}>{n}</button>
                    ))}
                    {jogadores.length === 0 && <span className="registro-vazio">Nenhum jogador na mesa.</span>}
                </div>
            )}
        </div>
    );
}

export default function CompendioRegistro() {
    const isMestre = useStore(s => s.isMestre);
    const meuNome = useStore(s => s.meuNome);
    const personagens = useStore(s => s.personagens);
    const [registro, setRegistro] = useState({ liberacoes: {}, pedidos: {} });
    const [busca, setBusca] = useState('');
    const [aviso, setAviso] = useState('');
    const [niveis, setNiveis] = useState({});
    const aprovando = useRef(new Set());
    const minhaChave = sanitizarNome(meuNome);

    useEffect(() => iniciarListenerRegistro(setRegistro, () => setAviso('Não consegui ler o Registro (sem conexão ou o servidor recusou).')), []);

    const todas = useMemo(() => indexarCapacidades(personagens), [personagens]);
    const porChave = useMemo(() => Object.fromEntries(todas.map(c => [c.chave, c])), [todas]);
    const jogadores = useMemo(
        () => Object.keys(personagens || {}).filter(n => { const f = personagens[n]; return f && !(f.isNPC || (f.bio && f.bio.mesa === 'npc')); }).sort((a, b) => a.localeCompare(b, 'pt-BR')),
        [personagens]
    );
    const visiveis = useMemo(() => {
        const base = isMestre ? todas : todas.filter(c => c.dono !== minhaChave && jogadorVeCapacidade(registro.liberacoes, c.chave, minhaChave));
        return filtrarCapacidades(base, busca).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }, [isMestre, todas, registro.liberacoes, busca, minhaChave]);
    const pendentes = useMemo(() => pedidosPendentes(registro.pedidos), [registro.pedidos]);

    const mudarLiberacao = useCallback(async (chave, valor) => {
        setAviso('');
        if (!(await definirLiberacao(chave, valor))) setAviso('Não consegui gravar a liberação (o servidor recusou).');
    }, []);

    const solicitar = useCallback(async (cap) => {
        setAviso('');
        if (jaPediu(registro.pedidos, minhaChave, cap.chave)) return;
        if (totalPedidosDe(registro.pedidos, minhaChave) >= LIMITE_PEDIDOS_POR_JOGADOR) { setAviso(`Você já tem ${LIMITE_PEDIDOS_POR_JOGADOR} pedidos esperando o Mestre.`); return; }
        const pedido = montarPedido({ de: minhaChave, chave: cap.chave });
        if (!pedido || !(await criarPedido(pedido))) setAviso('Não consegui enviar o pedido.');
    }, [registro.pedidos, minhaChave]);

    const aprovar = useCallback(async (pedido) => {
        if (aprovando.current.has(pedido.id)) return; // duplo clique não envia duas ofertas
        aprovando.current.add(pedido.id);
        try {
            setAviso('');
            const cap = porChave[pedido.chave];
            const aluno = personagens && personagens[pedido.de];
            if (!cap) { await removerPedido(pedido.id); setAviso('Esse item não existe mais nas fichas; o pedido foi descartado.'); return; }
            if (!aluno || aluno.isNPC || (aluno.bio && aluno.bio.mesa === 'npc')) { await removerPedido(pedido.id); setAviso('Pedido de um jogador que não existe mais; foi descartado.'); return; }
            if (jogadorJaTem(aluno, cap)) { await removerPedido(pedido.id); setAviso(`${pedido.de} já tem "${cap.nome}"; o pedido foi descartado.`); return; }
            if (!cap.copiavel) { setAviso('Singularidade não pode ser copiada nem ensinada.'); return; }
            const digitado = niveis[pedido.id];
            const nivel = digitado === undefined || String(digitado).trim() === '' ? NIVEL_PADRAO_APROVACAO : digitado;
            const r = await enviarEnsinamento({ professor: cap.dono, tipo: cap.tipo, item: cap.item, nivel, alunos: [pedido.de] });
            if (!r.ok) { setAviso(r.erro || 'Não consegui enviar o ensinamento.'); return; }
            if (!(await removerPedido(pedido.id))) setAviso('Enviei o ensinamento, mas não consegui apagar o pedido. NÃO aprove de novo: apague-o com Negar.');
        } finally { aprovando.current.delete(pedido.id); }
    }, [porChave, niveis, personagens]);

    return (
        <div className="fade-in registro-capacidades">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottom: '2px solid #00ffcc', paddingBottom: 10 }}>
                <h2 style={{ color: '#00ffcc', margin: 0, letterSpacing: 2 }}>📚 REGISTRO DE CAPACIDADES</h2>
            </div>
            <p className="registro-explica">
                {isMestre
                    ? 'Tudo o que existe nas fichas da mesa (Habilidades, Formas, Poderes, Infinities, Técnicas...). Escolha quem enxerga cada item; os jogadores pedem e você aprova.'
                    : 'Capacidades que o Mestre liberou para você. Solicite o que seu personagem copiou ou aprendeu; o Mestre decide.'}
            </p>
            {aviso && <div className="registro-aviso" role="alert">{aviso}</div>}

            {isMestre && pendentes.length > 0 && (
                <div className="registro-pedidos">
                    <h3>🔔 Pedidos ({pendentes.length})</h3>
                    {pendentes.map(p => {
                        const cap = porChave[p.chave];
                        return (
                            <div key={p.id} className="registro-pedido">
                                <span><strong>{p.de}</strong> quer <strong>{cap ? cap.nome : '(item removido)'}</strong>{cap ? ` — de ${cap.dono}` : ''}</span>
                                <label title="Nível de aprendizado (Maestria inicial)">Nível
                                    <input className="input-neon" type="number" min="0" max="100" value={niveis[p.id] ?? NIVEL_PADRAO_APROVACAO} onChange={e => setNiveis(n => ({ ...n, [p.id]: e.target.value }))} />
                                </label>
                                <button type="button" className="btn-neon btn-green registro-botao" onClick={() => aprovar(p)}>Aprovar</button>
                                <button type="button" className="btn-neon btn-red registro-botao" onClick={() => removerPedido(p.id)}>Negar</button>
                            </div>
                        );
                    })}
                </div>
            )}

            <input className="input-neon registro-busca" type="text" placeholder="🔍 Buscar por nome, dono ou categoria..." value={busca} onChange={e => setBusca(e.target.value)} />

            {visiveis.length === 0 && <p className="registro-vazio">{isMestre ? 'Nada encontrado nas fichas.' : 'O Mestre ainda não liberou nada para você.'}</p>}

            {isMestre
                ? visiveis.map(c => <LinhaMestre key={c.chave} cap={c} liberacao={registro.liberacoes} jogadores={jogadores} aoMudar={mudarLiberacao} />)
                : visiveis.map(c => {
                    const tem = jogadorJaTem(personagens && personagens[minhaChave], c);
                    const pediu = jaPediu(registro.pedidos, minhaChave, c.chave);
                    return (
                        <div key={c.chave} className="registro-item">
                            <div className="registro-item-topo">
                                <strong>{c.nome}</strong>
                                <span className="registro-tag">{c.rotuloCategoria}</span>
                                <button type="button" className="registro-botao" disabled={tem || pediu || !c.copiavel} onClick={() => solicitar(c)}>
                                    {tem ? '✔ Você já tem' : (pediu ? '⏳ Pedido enviado' : (c.copiavel ? 'Solicitar' : '🚫 Não copiável'))}
                                </button>
                            </div>
                            {c.descricao && <p className="registro-desc">{c.descricao}</p>}
                        </div>
                    );
                })}
        </div>
    );
}
