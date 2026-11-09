import React from 'react';
import { resumirItemImportado, mudarCategoriaImportada, listarEfeitosIncertos, listarGatilhosImportados, contarPendentes, contarGatilhosPendentes, faltaResponder, faltaResponderGatilho, decidirModoGatilhoImportado, decidirTodosOsGatilhos, decidirEfeitoIncerto, decidirTodosOsIncertos, definirTipoMultiplicador, TIPOS_MULTIPLICADOR } from '../../core/importadorIA';
import { descreverGatilho } from '../../core/gatilhos';
import { trocarElementoDaPrevia } from '../../core/importadorTecnicas';

const CATEGORIAS = [
    { id: 'habilidade', rotulo: 'Habilidade' },
    { id: 'poder', rotulo: 'Poder' },
    { id: 'forma', rotulo: 'Forma' },
];

const textoEfeito = (e) => (e.multiplicador
    ? `x${e.valor} em ${String(e.atributo || '').replace('_', ' ').toUpperCase()}`
    : `${String(e.atributo || '').replace('_', ' ').toUpperCase()} ${String(e.propriedade || '').toUpperCase()} ${e.valor}`);

function ListaEfeitos({ titulo, efeitos }) {
    if (!efeitos || efeitos.length === 0) return null;
    return (
        <div className="importacao-efeitos">
            <span className="importacao-efeitos-titulo">{titulo}</span>
            {efeitos.map((e, i) => <span key={i} className="importacao-chip" title={e.nome || ''}>{textoEfeito(e)}</span>)}
        </div>
    );
}

// 🔎 Prévia da importação: cada item que a IA devolveu, já validado pelo sistema, para o jogador conferir, trocar nome/categoria,
// desmarcar ou tirar antes de gravar no Grimório. Nada é gravado aqui: quem grava é o `onConfirmar`.
// Técnicas Elementais: passe `elementos` (nomes do Grimório) e `resumir`; o seletor de categoria dá lugar ao de elemento.
export default function ImportadorPrevia({ itens, onAtualizar, onRemover, onConfirmar, onVoltar, onAdicionarOutra, elementos, resumir }) {
    const modoTecnica = Array.isArray(elementos);
    const marcados = itens.filter(it => it.marcado && it.valido).length;
    // Efeitos sem ativação clara: o jogador precisa responder antes de gravar (só nos itens marcados).
    const pendentes = itens.filter(it => it.marcado && it.valido).reduce((soma, it) => soma + contarPendentes(it.objeto), 0);

    const pendentesGatilhos = itens.filter(it => it.marcado && it.valido).reduce((soma, it) => soma + contarGatilhosPendentes(it.objeto), 0);
    const pendentesEfeitos = pendentes - pendentesGatilhos;

    const decidir = (it, onde, indice, destino) => onAtualizar(it.chave, { ...it, objeto: decidirEfeitoIncerto(it.objeto, onde, indice, destino) });
    const escolherTipo = (it, onde, indice, tipo) => onAtualizar(it.chave, { ...it, objeto: definirTipoMultiplicador(it.objeto, onde, indice, tipo) });
    const decidirTodos = (it, destino) => onAtualizar(it.chave, { ...it, objeto: decidirTodosOsIncertos(it.objeto, destino) });
    const decidirGatilho = (it, onde, indice, modo) => onAtualizar(it.chave, { ...it, objeto: decidirModoGatilhoImportado(it.objeto, onde, indice, modo) });
    const decidirTodosGatilhos = (it, modo) => onAtualizar(it.chave, { ...it, objeto: decidirTodosOsGatilhos(it.objeto, modo) });
    const tirarSub = (it, indice) => onAtualizar(it.chave, { ...it, objeto: { ...it.objeto, formas: it.objeto.formas.filter((_, i) => i !== indice) } });

    const trocarNome = (it, nome) => {
        const valido = nome.trim().length > 0;
        onAtualizar(it.chave, { ...it, objeto: { ...it.objeto, nome }, valido, marcado: valido ? it.marcado : false });
    };
    const trocarElemento = (it, elemento) => onAtualizar(it.chave, trocarElementoDaPrevia(it, elemento));
    const trocarCategoria = (it, categoria) => onAtualizar(it.chave, { ...it, objeto: mudarCategoriaImportada(it.objeto, categoria) });

    return (
        <div className="importacao-previa">
            <div className="importacao-titulo">🔎 Prévia: confira antes de gravar ({marcados} de {itens.length} marcados)</div>
            {itens.map(it => (
                <div key={it.chave} className={`importacao-item${it.marcado ? '' : ' desmarcado'}${it.valido ? '' : ' invalido'}`}>
                    <div className="importacao-item-topo">
                        <input type="checkbox" checked={!!it.marcado} disabled={!it.valido} aria-label={`Importar ${it.objeto.nome || 'item sem nome'}`} onChange={e => onAtualizar(it.chave, { ...it, marcado: e.target.checked })} />
                        <input className="importacao-nome" value={it.objeto.nome} placeholder="Nome (obrigatório)" aria-label="Nome" onChange={e => trocarNome(it, e.target.value)} />
                        {modoTecnica ? (
                            <select value={it.objeto.elemento} aria-label="Elemento" onChange={e => trocarElemento(it, e.target.value)}>
                                {(elementos.includes(it.objeto.elemento) ? elementos : [it.objeto.elemento, ...elementos]).map(el => <option key={el} value={el}>{el}</option>)}
                            </select>
                        ) : (
                            <select value={it.objeto.categoria} aria-label="Categoria" onChange={e => trocarCategoria(it, e.target.value)}>
                                {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
                            </select>
                        )}
                        <button type="button" className="importacao-remover" title="Tirar da lista" aria-label="Tirar da lista" onClick={() => onRemover(it.chave)}>✕</button>
                    </div>
                    <div className="importacao-resumo">{(resumir || resumirItemImportado)(it.objeto)}{it.objeto.tipoAcao ? ` · ação: ${it.objeto.tipoAcao}` : ''}</div>
                    <ListaEfeitos titulo="Ativos:" efeitos={it.objeto.efeitos} />
                    <ListaEfeitos titulo="Passivos:" efeitos={it.objeto.efeitosPassivos} />
                    {Array.isArray(it.objeto.formas) && it.objeto.formas.length > 0 && (
                        <div className="importacao-subs">
                            <div className="importacao-efeitos-titulo">🔱 Habilidades dentro deste Poder (viram Formas Místicas dele):</div>
                            {it.objeto.formas.map((forma, i) => {
                                const cfg = (forma.configs && forma.configs[0]) || {};
                                return (
                                    <div key={`s${i}`} className="importacao-sub">
                                        <div className="importacao-sub-topo">
                                            <strong>{forma.nome}</strong>
                                            <button type="button" className="importacao-remover" title="Não importar esta habilidade" aria-label={`Tirar ${forma.nome}`} onClick={() => tirarSub(it, i)}>✕</button>
                                        </div>
                                        <ListaEfeitos titulo="Ativos:" efeitos={cfg.efeitos} />
                                        <ListaEfeitos titulo="Passivos:" efeitos={cfg.efeitosPassivos} />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {listarEfeitosIncertos(it.objeto).length > 0 && (
                        <div className="importacao-incertos" role="group" aria-label="Efeitos sem ativação clara">
                            <div className="importacao-efeitos-titulo">❓ O texto não diz se estes efeitos valem sempre ou só com a habilidade ligada (e, nos multiplicadores, de que tipo são). Como aplicar?</div>
                            {listarEfeitosIncertos(it.objeto).map(({ onde, indice, efeito }) => (
                                <div key={`${onde}_${indice}`} className={`importacao-incerto${faltaResponder(efeito) ? '' : ' respondido'}`}>
                                    <span className="importacao-incerto-estado" aria-hidden="true">{faltaResponder(efeito) ? '❓' : '✔'}</span>
                                    <span className="importacao-chip" title={efeito.nome || ''}>{onde === 'pai' ? '' : `${it.objeto.formas[onde].nome}: `}{efeito.nome ? `${efeito.nome} · ` : ''}{textoEfeito(efeito)}</span>
                                    <button type="button" className={`importacao-opcao${efeito.destino === 'ativo' ? ' escolhida' : ''}`} aria-pressed={efeito.destino === 'ativo'} onClick={() => decidir(it, onde, indice, 'ativo')}>{efeito.destino === 'ativo' ? '✔ ' : ''}⚡ Só ao ativar</button>
                                    <button type="button" className={`importacao-opcao${efeito.destino === 'passivo' ? ' escolhida' : ''}`} aria-pressed={efeito.destino === 'passivo'} onClick={() => decidir(it, onde, indice, 'passivo')}>{efeito.destino === 'passivo' ? '✔ ' : ''}🛡️ Sempre (passivo)</button>
                                    {efeito.multiplicador && (
                                        <span className="importacao-tipos" role="group" aria-label="Tipo de multiplicador">
                                            <span className="importacao-efeitos-titulo">Tipo:</span>
                                            {TIPOS_MULTIPLICADOR.map(t => (
                                                <button key={t.id} type="button" className={`importacao-opcao${efeito.propriedade === t.id ? ' escolhida' : ''}`} aria-pressed={efeito.propriedade === t.id} onClick={() => escolherTipo(it, onde, indice, t.id)}>{efeito.propriedade === t.id ? '✔ ' : ''}{t.rotulo}</button>
                                            ))}
                                        </span>
                                    )}
                                </div>
                            ))}
                            <div className="importacao-incerto-todos">
                                <button type="button" className="importacao-opcao" onClick={() => decidirTodos(it, 'ativo')}>Todos só ao ativar</button>
                                <button type="button" className="importacao-opcao" onClick={() => decidirTodos(it, 'passivo')}>Todos sempre</button>
                            </div>
                        </div>
                    )}
                    {listarGatilhosImportados(it.objeto).length > 0 && (
                        <div className="importacao-gatilhos" role="group" aria-label="Gatilhos importados">
                            <div className="importacao-efeitos-titulo">🔔 Gatilhos encontrados no texto. Cada um dispara sozinho (automático) ou só quando o dono o arma (opcional)?</div>
                            {listarGatilhosImportados(it.objeto).map(({ onde, indice, gatilho }) => {
                                const pendente = faltaResponderGatilho(gatilho);
                                const automatico = !pendente && gatilho.modo === 'automatico';
                                const opcional = !pendente && gatilho.modo === 'opcional';
                                return (
                                    <div key={`g${onde}_${indice}`} className={`importacao-gatilho${pendente ? '' : ' respondido'}`}>
                                        <span className="importacao-incerto-estado" aria-hidden="true">{pendente ? '❓' : '✔'}</span>
                                        <span className="importacao-gatilho-frase"><strong>{onde === 'pai' ? '' : `${it.objeto.formas[onde].nome}: `}{gatilho.nome}</strong> · {descreverGatilho({ ...gatilho, modo: 'automatico' })}</span>
                                        <button type="button" className={`importacao-opcao${automatico ? ' escolhida' : ''}`} aria-pressed={automatico} onClick={() => decidirGatilho(it, onde, indice, 'automatico')}>{automatico ? '✔ ' : ''}⚡ Automático</button>
                                        <button type="button" className={`importacao-opcao${opcional ? ' escolhida' : ''}`} aria-pressed={opcional} onClick={() => decidirGatilho(it, onde, indice, 'opcional')}>{opcional ? '✔ ' : ''}🎚️ Opcional (desarmado)</button>
                                    </div>
                                );
                            })}
                            <div className="importacao-incerto-todos">
                                <button type="button" className="importacao-opcao" onClick={() => decidirTodosGatilhos(it, 'automatico')}>Todos automáticos</button>
                                <button type="button" className="importacao-opcao" onClick={() => decidirTodosGatilhos(it, 'opcional')}>Todos opcionais</button>
                            </div>
                        </div>
                    )}
                    {it.avisos.map((a, i) => <div key={`a${i}`} className="importacao-aviso">⚠️ {a}</div>)}
                    {it.naoAplicado.length > 0 && (
                        <div className="importacao-nao-aplicado">
                            <div className="importacao-efeitos-titulo">📝 Não aplicado automaticamente (fica nas notas):</div>
                            {it.naoAplicado.map((n, i) => <div key={`n${i}`}>• {n}</div>)}
                        </div>
                    )}
                </div>
            ))}
            <div className="importacao-acoes">
                <button type="button" onClick={onVoltar}>Voltar</button>
                <button type="button" onClick={onAdicionarOutra}>+ Colar outra resposta</button>
                <button type="button" className="importacao-confirmar" disabled={marcados === 0 || pendentes > 0} title={pendentes > 0 ? 'Responda as perguntas marcadas com ❓' : ''} onClick={onConfirmar}>Gravar {marcados} no Grimório</button>
                {pendentes > 0 && <div className="importacao-aviso" role="status">❓ {[pendentesEfeitos > 0 ? 'Falta responder ' + pendentesEfeitos + ' efeito(s): só ao ativar ou sempre?' : '', pendentesGatilhos > 0 ? (pendentesEfeitos > 0 ? 'E ' : 'Falta responder ') + pendentesGatilhos + ' gatilho(s): automático ou opcional?' : ''].filter(Boolean).join(' ')}</div>}
            </div>
        </div>
    );
}
