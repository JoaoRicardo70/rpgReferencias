import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import useStore, { sanitizarNome } from '../../stores/useStore';
import { PedidosNaFicha } from './MestrePedidosSexta';
import { emogis, cores, NIVEIS_DOMINIO } from '../arsenal/ElementosFormContext';
import { getNivelDominio } from '../../core/dominios';
import { ordenarPedidosPendentes } from '../../core/sextaFeiraCriacao';
import {
    ABAS_GRIMORIO_MESTRE, listaDaFicha, separarPoderesPorCategoria, agruparPorPasta,
    agruparTecnicasPorElemento, textoEfeito, listarDominios, abaDoPedido,
} from '../../core/grimorioLeitura';

// 📖 GRIMÓRIO DA ENTIDADE (aba do Mestre): a ficha de outro personagem, só para leitura, com as
// mesmas divisões das abas dele — Habilidades / Poderes / Formas (Poderes Clássicos), Técnicas
// Elementais, Inventário e Domínios. Os pedidos da Sexta-Feira pendentes aparecem na aba onde vão
// entrar (PedidosNaFicha), com Aprovar/Recusar.
//
// Vai num portal em document.body: o painel da aba usa backdrop-filter, que prende um
// position: fixed dentro dele — sem o portal a janela abria no TOPO da aba, longe de quem clicou
// num card mais abaixo.

// Campos de texto da ficha vêm do banco: um objeto no lugar de um texto não pode derrubar a tela.
const txt = (v) => (typeof v === 'string' || typeof v === 'number' ? v : '');

const ATRIBUTOS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];

function CartaoPoder({ p }) {
    const categoria = String(p.categoria || '').toLowerCase();
    const vertente = String(p.vertente || '');
    const efeitos = listaDaFicha(p.efeitos).map(textoEfeito).filter(Boolean);
    const passivos = listaDaFicha(p.efeitosPassivos).map(textoEfeito).filter(Boolean);
    const maestria = parseFloat(p.maestria) || 0;
    const maestriaReq = parseFloat(p.maestriaRequerida) || 0;
    const subFormas = listaDaFicha(p.formas).length;
    return (
        <div className={`grimorio-cartao${p.ativa ? ' ativo' : ''}`}>
            <div className="grimorio-cartao-topo">
                <strong className="grimorio-cartao-nome">{txt(p.nome) || 'Sem nome'}</strong>
                {p.ativa && <span className="grimorio-selo ativo">★ Ativa</span>}
                <span className="grimorio-selo">Alcance {txt(p.alcance) || 1}Q</span>
                {vertente && <span className="grimorio-selo">{/elemental/i.test(vertente) ? `🌪️ Elemental: ${txt(p.elemento) || '?'}` : vertente}</span>}
                {categoria === 'forma' && maestria > 0 && <span className="grimorio-selo verde">🥋 {Math.min(100, maestria)}% maestria</span>}
                {categoria === 'forma' && <span className="grimorio-selo laranja">😮‍💨 {p.fadigaPorUso !== undefined ? txt(p.fadigaPorUso) : 15} fadiga/uso</span>}
                {categoria !== 'forma' && maestriaReq > 0 && (
                    <span className={`grimorio-selo ${maestria >= maestriaReq ? 'verde' : 'laranja'}`}>🎓 Maestria {maestria}% / {maestriaReq}%</span>
                )}
            </div>
            {txt(p.descricao) && <p className="grimorio-cartao-descricao">"{txt(p.descricao)}"</p>}
            {txt(p.elementosAfetados) && <p className="grimorio-cartao-linha">🌊 Consome/Afeta: {txt(p.elementosAfetados)}</p>}
            <div className="grimorio-cartao-numeros">
                <span><b>Dados:</b> {Number(p.dadosQtd) > 0 ? `${txt(p.dadosQtd)}d${txt(p.dadosFaces) || 20}` : 'sem dano'}</span>
                <span><b>Custo:</b> {Number(p.custoPercentual) || 0}% das energias</span>
                {Number(p.area) > 0 && <span><b>Área:</b> {txt(p.area)}Q</span>}
                {subFormas > 0 && <span><b>Formas internas:</b> {subFormas}</span>}
            </div>
            <div className="grimorio-cartao-mecanica">
                <b>Mecânica:</b> {efeitos.join(' | ') || 'Sem bônus matemático.'}
                {passivos.length > 0 && <span className="grimorio-cartao-passivos">[PASSIVO] {passivos.join(' | ')}</span>}
            </div>
        </div>
    );
}

function CartaoTecnica({ m, ficha }) {
    const elemento = String(m.elemento || '').trim() || 'Neutro';
    const nivel = getNivelDominio(ficha, elemento);
    const mecanica = String(m.tipoMecanica || 'ataque');
    const bonus = m.bonusTipo && m.bonusTipo !== 'nenhum'
        ? `${String(m.bonusTipo).replace('_', ' ').toUpperCase()}: ${String(m.bonusTipo).includes('mult_') ? 'x' : '+'}${txt(m.bonusValor) || 0}`
        : 'Básico';
    const alvos = m.alvosAfetados === 'inimigos' ? 'Inimigos' : m.alvosAfetados === 'aliados' ? 'Aliados' : 'Todos';
    return (
        <div className={`grimorio-cartao${m.equipado ? ' ativo' : ''}`}>
            <div className="grimorio-cartao-topo">
                <strong className="grimorio-cartao-nome">{txt(m.nome) || 'Técnica sem nome'}</strong>
                {m.equipado && <span className="grimorio-selo ativo">★ Memorizada</span>}
                <span className="grimorio-selo">Alcance {txt(m.alcanceQuad) || 1}Q</span>
                <span className="grimorio-selo">{mecanica.toUpperCase()}{mecanica === 'saving' && m.savingAttr ? ` · ${String(m.savingAttr).toUpperCase()}` : ''}</span>
            </div>
            {txt(m.descricao) && <p className="grimorio-cartao-descricao">"{txt(m.descricao)}"</p>}
            <div className="grimorio-cartao-numeros">
                <span><b>Bônus:</b> {bonus}</span>
                {Number(m.dadosExtraQtd) > 0 && <span><b>Dados extra:</b> +{txt(m.dadosExtraQtd)}d{txt(m.dadosExtraFaces) || 20}</span>}
                <span><b>Custo:</b> {Number(m.custoValor) > 0 ? `${txt(m.custoValor)}% (${String(m.energiaCombustao || 'flexivel').toUpperCase()})` : 'Livre'}</span>
                {Number(m.areaQuad) > 0 && <span><b>Área:</b> {txt(m.areaQuad)}Q · {alvos} · {Number(m.duracaoZona) > 0 ? `${txt(m.duracaoZona)} turnos` : 'instantâneo'}</span>}
            </div>
            {txt(m.elementosAfetados) && <p className="grimorio-cartao-linha">Reage com: {txt(m.elementosAfetados)}</p>}
            <p className="grimorio-cartao-linha">
                Domínio de {elemento}: {nivel > 0 ? `Nv. ${nivel} — ${NIVEIS_DOMINIO[nivel]?.nome || ''}` : 'nenhum'}
            </p>
        </div>
    );
}

function CartaoItem({ item }) {
    const efeitos = [...listaDaFicha(item.efeitos), ...listaDaFicha(item.efeitosPassivos)].map(textoEfeito).filter(Boolean);
    return (
        <div className={`grimorio-cartao${item.equipado ? ' ativo' : ''}`}>
            <div className="grimorio-cartao-topo">
                <strong className="grimorio-cartao-nome">{txt(item.nome) || 'Item desconhecido'}</strong>
                <span className={`grimorio-selo${item.equipado ? ' ativo' : ''}`}>{item.equipado ? 'Equipado' : 'Na mochila'}</span>
                {txt(item.tipo) && <span className="grimorio-selo">{txt(item.tipo)}{txt(item.armaTipo) ? ` · ${txt(item.armaTipo)}` : ''}</span>}
                {txt(item.raridade) && <span className="grimorio-selo">{txt(item.raridade)}</span>}
            </div>
            <div className="grimorio-cartao-numeros">
                {Number(item.dadosQtd) > 0 && <span><b>Dados:</b> {txt(item.dadosQtd)}d{txt(item.dadosFaces) || 20}</span>}
                {item.bonusTipo && <span><b>Bônus:</b> {String(item.bonusTipo).replace('_', ' ')} {txt(item.bonusValor) || 0}</span>}
            </div>
            {efeitos.length > 0 && <div className="grimorio-cartao-mecanica"><b>Efeitos:</b> {efeitos.join(' | ')}</div>}
        </div>
    );
}

function ListaPoderes({ itens, categoria, vazio }) {
    const [fechadas, setFechadas] = useState({});
    if (itens.length === 0) return <div className="grimorio-vazio">{vazio}</div>;
    const grupos = agruparPorPasta(itens, categoria);
    if (!grupos) return itens.map((p, i) => <CartaoPoder key={p.id || i} p={p} />);
    return grupos.map(({ nome, itens: doGrupo }) => (
        <div key={nome} className="grimorio-pasta">
            <button type="button" className="grimorio-pasta-titulo" onClick={() => setFechadas(prev => ({ ...prev, [nome]: !prev[nome] }))} aria-expanded={!fechadas[nome]}>
                {fechadas[nome] ? '▶' : '▼'} 📁 {nome} <small>({doGrupo.length})</small>
            </button>
            {!fechadas[nome] && doGrupo.map((p, i) => <CartaoPoder key={p.id || `${nome}_${i}`} p={p} />)}
        </div>
    ));
}

export default function GrimorioEntidade({ jogador, pedidoFocoId, aoFechar }) {
    const pendentes = useStore(s => s.sextaFeiraPendentes);
    const ficha = jogador?.ficha || {};
    const nome = jogador?.nome || '';

    const poderes = useMemo(() => separarPoderesPorCategoria(ficha.poderes), [ficha.poderes]);
    const tecnicas = useMemo(() => agruparTecnicasPorElemento(ficha.ataquesElementais), [ficha.ataquesElementais]);
    const inventario = useMemo(() => listaDaFicha(ficha.inventario), [ficha.inventario]);
    const dominios = useMemo(() => listarDominios(ficha.dominios), [ficha.dominios]);

    // Pedidos pendentes deste personagem por aba (selo "⏳" nas abas).
    const pedidosPorAba = useMemo(() => {
        const alvo = sanitizarNome(nome);
        const contagem = {};
        let abaDoFoco = null;
        ordenarPedidosPendentes(pendentes).forEach(([id, p]) => {
            if (sanitizarNome(p.alvo || p.solicitante) !== alvo) return;
            const aba = abaDoPedido(p);
            if (!aba) return;
            contagem[aba] = (contagem[aba] || 0) + 1;
            if (id === pedidoFocoId) abaDoFoco = aba;
        });
        return { contagem, abaDoFoco };
    }, [pendentes, nome, pedidoFocoId]);

    const abaInicial = () => pedidosPorAba.abaDoFoco
        || ['habilidade', 'poder', 'forma'].find(c => poderes[c].length > 0)
        || 'habilidade';
    const [aba, setAba] = useState(abaInicial);

    // "Ver a Habilidade" de outro pedido com a janela aberta: vai pra aba dele.
    useEffect(() => {
        if (pedidosPorAba.abaDoFoco) setAba(pedidosPorAba.abaDoFoco);
    }, [pedidoFocoId, pedidosPorAba.abaDoFoco]);

    // Esc fecha (a não ser que uma janela da Sexta-Feira esteja aberta por cima).
    useEffect(() => {
        const aoTeclar = (e) => {
            if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('.sexta-modal-fundo')) return;
            aoFechar?.();
        };
        document.addEventListener('keydown', aoTeclar);
        return () => document.removeEventListener('keydown', aoTeclar);
    }, [aoFechar]);

    if (!jogador) return null;

    const quantidade = {
        habilidade: poderes.habilidade.length, poder: poderes.poder.length, forma: poderes.forma.length,
        magias: tecnicas.reduce((t, g) => t + g.itens.length, 0), inventario: inventario.length, dominios: dominios.length,
    };

    const pedidos = <PedidosNaFicha nome={nome} aba={aba} pedidoFocoId={pedidoFocoId} />;

    const conteudo = (
        <div className="grimorio-mestre-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar?.(); }}>
            <div className="grimorio-mestre fade-in" role="dialog" aria-modal="true" aria-label={`Grimório de ${nome}`}>
                <button type="button" className="grimorio-mestre-fechar" onClick={aoFechar} aria-label="Fechar">✕</button>

                <div className="grimorio-mestre-cabecalho">
                    {typeof ficha.avatar?.base === 'string' && ficha.avatar.base
                        ? <img src={ficha.avatar.base} alt="Avatar" className="grimorio-mestre-avatar" />
                        : <div className="grimorio-mestre-avatar vazio">Sem Foto</div>}
                    <div>
                        <h2 className="grimorio-mestre-titulo">📖 GRIMÓRIO: {nome}</h2>
                        <span className="grimorio-mestre-classe">Classe: {String(txt(jogador.classId)).toUpperCase() || 'MUNDANO'}</span>
                    </div>
                </div>

                <div className="grimorio-mestre-atributos">
                    {ATRIBUTOS.map(attr => (
                        <div key={attr} className="grimorio-mestre-atributo">
                            <span>{attr.substring(0, 3)}</span>
                            <strong>{txt(ficha[attr]?.base) || 0}</strong>
                        </div>
                    ))}
                </div>

                <div className="grimorio-mestre-abas" role="tablist">
                    {ABAS_GRIMORIO_MESTRE.map(a => (
                        <button
                            key={a.id}
                            type="button"
                            role="tab"
                            aria-selected={aba === a.id}
                            className={`grimorio-mestre-aba${aba === a.id ? ' ativa' : ''}`}
                            onClick={() => setAba(a.id)}
                        >
                            {a.icone} {a.nome} <small>({quantidade[a.id]})</small>
                            {pedidosPorAba.contagem[a.id] > 0 && <span className="grimorio-mestre-aba-pedido" title="Pedidos aguardando aprovação">⏳{pedidosPorAba.contagem[a.id]}</span>}
                        </button>
                    ))}
                </div>

                <div className="grimorio-mestre-conteudo" role="tabpanel">
                    {(aba === 'habilidade' || aba === 'poder' || aba === 'forma') && (
                        <>
                            <ListaPoderes
                                key={aba}
                                itens={poderes[aba]}
                                categoria={aba}
                                vazio={aba === 'forma' ? 'Nenhuma Forma registrada.' : aba === 'poder' ? 'Nenhum Poder registrado.' : 'Nenhuma Habilidade registrada.'}
                            />
                            {pedidos}
                        </>
                    )}

                    {aba === 'magias' && (
                        <>
                            {tecnicas.length === 0 && <div className="grimorio-vazio">Nenhuma Técnica Elemental.</div>}
                            {tecnicas.map(({ elemento, itens }) => (
                                <div key={elemento} className="grimorio-pasta">
                                    {/* Cor do elemento: valor dinâmico (mesma tabela da aba Elementos). */}
                                    <h4 className="grimorio-elemento-titulo" style={{ color: cores[elemento] || undefined }}>
                                        {emogis[elemento] || '✨'} Pergaminhos de {elemento} <small>({itens.length})</small>
                                    </h4>
                                    {itens.map((m, i) => <CartaoTecnica key={m.id || `${elemento}_${i}`} m={m} ficha={ficha} />)}
                                </div>
                            ))}
                            {pedidos}
                        </>
                    )}

                    {aba === 'inventario' && (
                        <>
                            {inventario.length === 0 && <div className="grimorio-vazio">O relicário deste personagem está vazio.</div>}
                            {inventario.map((item, i) => <CartaoItem key={item.id || i} item={item} />)}
                            {pedidos}
                        </>
                    )}

                    {aba === 'dominios' && (
                        dominios.length === 0
                            ? <div className="grimorio-vazio">Nenhum Domínio registrado.</div>
                            : dominios.map(d => (
                                <div key={d.nome} className="grimorio-cartao grimorio-dominio">
                                    <strong className="grimorio-cartao-nome">{d.nome}</strong>
                                    <span>
                                        <span className="grimorio-dominio-nivel">Nv {d.nivel}{NIVEIS_DOMINIO[d.nivel] ? ` — ${NIVEIS_DOMINIO[d.nivel].nome}` : ''}</span>
                                        {d.categoria && <small> ({d.categoria})</small>}
                                    </span>
                                </div>
                            ))
                    )}
                </div>
            </div>
        </div>
    );

    return typeof document !== 'undefined' && document.body ? createPortal(conteudo, document.body) : conteudo;
}

