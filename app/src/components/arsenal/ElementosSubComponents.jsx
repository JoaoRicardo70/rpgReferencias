import React, { useState } from 'react';
import { useElementosForm, emogis, cores, BONUS_OPTIONS, NIVEIS_DOMINIO } from './ElementosFormContext';
import { getNivelDominio, getFracaoDominio, calcularReducaoDanoElemental } from '../../core/dominios';

const FALLBACK = <div style={{ opacity: 0.5, padding: 10 }}>Elementos provider não encontrado...</div>;

export function ElementosImportadorIA() {
    const ctx = useElementosForm();
    const [aberto, setAberto] = useState(false);
    const [textoDocs, setTextoDocs] = useState('');
    const [jsonResposta, setJsonResposta] = useState('');
    const [fase, setFase] = useState(1); 

    if (!ctx) return null;
    const { injetarJsonDaIA } = ctx;

    const gerarPrompt = () => {
        if (!textoDocs.trim()) return alert("Cole o texto dos pergaminhos primeiro!");
        const prompt = `Atue como extrator de dados de RPG.
Transforme TODAS as magias, técnicas e feitiços descritos no texto abaixo em itens dentro do array "ataquesElementais".
Tente deduzir o "elemento" a que pertencem (Ex: Fogo, Agua, Magia de Osso, Magias de 1º Ciclo, Aura Pura). Se não souber, use "Neutro".
Extraia o dano (ex: "15d6" vira danoQtd: 15 e danoFaces: 6).
Extraia o custo de energia se houver (ex: "Custa 10%" vira custoPercentual: 10).
Tente deduzir a "energiaCombustao" (mana, aura, chakra, corpo, livre). Se for indeciso, use "flexivel".
Se houver efeitos de status, paralisia, condições ou buffs complexos, coloque TUDO no campo "notasIA".

TEXTO:
${textoDocs}

RETORNE EXATAMENTE UM JSON PURO:
{
  "ataquesElementais": [{ "nome": "X", "descricao": "Y", "elemento": "Fogo", "energiaCombustao": "mana", "danoQtd": 0, "danoFaces": 0, "custoPercentual": 0, "alcance": 1, "area": 0, "notasIA": "" }]
}`;
        navigator.clipboard.writeText(prompt);
        alert("Instrução mágica copiada! Envie para a sua IA e traga o código resultante.");
        setFase(2);
    };

    return (
        <div style={{ marginBottom: '20px', width: '100%' }}>
            <button onClick={() => setAberto(!aberto)} style={{ width: '100%', padding: '10px' }}>
                {aberto ? 'Fechar Círculo de Invocação (IA)' : 'Abrir Círculo de Invocação (IA)'}
            </button>
            {aberto && (
                <div className="fade-in" style={{ marginTop: '10px', border: '1px dashed currentColor', padding: '15px', borderRadius: '8px', background: 'rgba(0,0,0,0.05)' }}>
                    {fase === 1 ? (
                        <>
                            <textarea value={textoDocs} onChange={e => setTextoDocs(e.target.value)} placeholder="Cole aqui os manuscritos, feitiços e grimórios extensos..." style={{ width: '100%', height: '120px', background: 'transparent', padding: '10px', resize: 'vertical' }} />
                            <button onClick={gerarPrompt} style={{ width: '100%', marginTop: '10px', padding: '8px' }}>1. Copiar Feitiço de Extração (Prompt)</button>
                        </>
                    ) : (
                        <>
                            <textarea value={jsonResposta} onChange={e => setJsonResposta(e.target.value)} placeholder="Cole o Código Arcano (JSON) devolvido pela IA..." style={{ width: '100%', height: '120px', background: 'transparent', fontFamily: 'monospace', padding: '10px', resize: 'vertical' }} />
                            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                <button onClick={() => setFase(1)} style={{ flex: 1, padding: '8px' }}>Voltar</button>
                                <button onClick={() => { if(injetarJsonDaIA(jsonResposta)) setAberto(false); }} style={{ flex: 2, padding: '8px' }}>2. Transcrever para o Grimório</button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// ============================================================================
// 🔥 O NAVEGADOR COM ÍNDICE RÁPIDO 🔥
// ============================================================================
export function ElementosNavegacaoLivro() {
    const ctx = useElementosForm();
    if (!ctx) return null;
    const { abaAtual, setAbaAtual, cancelarEdicaoElem, abasDinamicas } = ctx;

    const chaves = Object.keys(abasDinamicas);
    const indexAtual = chaves.indexOf(abaAtual);
    const total = chaves.length;

    const irPara = (novoIndex) => {
        if (novoIndex >= 0 && novoIndex < total) {
            setAbaAtual(chaves[novoIndex]);
            cancelarEdicaoElem();
        }
    };

    const dadosAba = abasDinamicas[abaAtual];

    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px dashed currentColor', paddingBottom: '15px', marginBottom: '20px' }}>
            <button onClick={() => irPara(indexAtual - 1)} disabled={indexAtual === 0} style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: '1.2em', cursor: indexAtual === 0 ? 'default' : 'pointer', opacity: indexAtual === 0 ? 0.3 : 1, fontWeight: 'bold' }}>
                ⮜ Folhear para Trás
            </button>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <select 
                    value={abaAtual} 
                    onChange={(e) => { setAbaAtual(e.target.value); cancelarEdicaoElem(); }}
                    style={{ background: 'transparent', color: 'inherit', border: 'none', borderBottom: '1px dotted currentColor', fontSize: '0.9em', textTransform: 'uppercase', letterSpacing: '1px', outline: 'none', cursor: 'pointer', textAlign: 'center', opacity: 0.8 }}
                    title="Pular para um Capítulo"
                >
                    {chaves.map((k, i) => (
                        <option key={k} value={k} style={{ background: '#1e1423', color: '#e6d5b8' }}>
                            Capítulo {i + 1} de {total}: {abasDinamicas[k].label}
                        </option>
                    ))}
                </select>
                
                <h2 style={{ margin: '5px 0 0 0', fontSize: '1.8em', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span>{dadosAba.icon}</span> {dadosAba.label}
                </h2>
            </div>

            <button onClick={() => irPara(indexAtual + 1)} disabled={indexAtual === total - 1} style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: '1.2em', cursor: indexAtual === total - 1 ? 'default' : 'pointer', opacity: indexAtual === total - 1 ? 0.3 : 1, fontWeight: 'bold' }}>
                Folhear para Frente ⮞
            </button>
        </div>
    );
}

// ============================================================================
// AS PÁGINAS COM O BOTÃO CRIAR
// ============================================================================
export function ElementosGrimorio() {
    const ctx = useElementosForm();
    if (!ctx) return FALLBACK;
    const { abaAtual, elemSelecionado, selecionarElemento, minhaFicha, abasDinamicas, criarElementoCustomizado } = ctx;
    const categoriasVisiveis = abasDinamicas[abaAtual]?.categorias || [];

    const handleCriar = () => {
        const nome = window.prompt(`Como se chama o novo Conhecimento/Caminho que quer forjar neste capítulo?`);
        if (nome) criarElementoCustomizado(nome);
    };

    return (
        <div key={abaAtual} className="fade-in" style={{ padding: '0 15px 15px 15px', borderBottom: '2px dashed currentColor', marginBottom: '20px' }}>
            {categoriasVisiveis.length === 0 ? (
                <p style={{ opacity: 0.6, fontStyle: 'italic', textAlign: 'center' }}>Páginas em branco neste capítulo...</p>
            ) : (
                categoriasVisiveis.map(categoria => (
                    <div key={categoria.titulo} style={{ marginBottom: 25 }}>
                        <h4 style={{ fontSize: '1em', letterSpacing: '1px', borderBottom: '1px solid currentColor', paddingBottom: 4, marginBottom: 12, marginTop: 0, opacity: 0.8, textAlign: 'center' }}>
                            {categoria.titulo}
                        </h4>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                            {categoria.itens.map(elem => {
                                const isActive = elem === elemSelecionado;
                                const nivelDom = getNivelDominio(minhaFicha, elem);
                                const domTexto = nivelDom ? ` (Nv.${nivelDom})` : '';
                                const corBase = cores[elem] || 'currentColor';
                                
                                return (
                                    <button key={elem} onClick={() => selecionarElemento(elem)}
                                        style={{ 
                                            padding: '6px 12px', fontSize: '0.9em', borderRadius: '4px',
                                            border: isActive ? `2px solid ${corBase}` : '1px dashed currentColor',
                                            background: isActive ? 'rgba(0,0,0,0.05)' : 'transparent',
                                            color: isActive ? corBase : 'inherit',
                                            opacity: isActive ? 1 : 0.7,
                                            boxShadow: isActive ? `inset 0 0 10px ${corBase}` : 'none',
                                            transform: isActive ? 'scale(1.05)' : 'scale(1)',
                                            transition: 'all 0.2s ease'
                                        }}>
                                        {emogis[elem] || '\u2728'} {elem}
                                        <span style={{ fontWeight: nivelDom ? 'bold' : 'normal', opacity: 0.9 }}>{domTexto}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))
            )}

            {/* 🔥 BOTÃO DE CRIAÇÃO LIVRE 🔥 */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '25px' }}>
                <button onClick={handleCriar} style={{ background: 'transparent', border: '1px dashed currentColor', color: 'inherit', padding: '5px 15px', borderRadius: '4px', opacity: 0.6, fontSize: '0.85em', cursor: 'pointer' }}>
                    + Forjar Novo Conhecimento Neste Capítulo
                </button>
            </div>
        </div>
    );
}

export function ElementosFormMagia() {
    const ctx = useElementosForm();
    if (!ctx) return FALLBACK;
    const {
        elemEditandoId, nomeElem, setNomeElem, descricaoElem, setDescricaoElem, elementosAfetados, setElementosAfetados,
        tipoMecanica, setTipoMecanica, savingAttr, setSavingAttr,
        energiaCombustao, setEnergiaCombustao, allowedEnergies, alcanceQuad, setAlcanceQuad, 
        areaQuad, setAreaQuad, alvosAfetados, setAlvosAfetados, duracaoZona, setDuracaoZona,
        bonusTipo, setBonusTipo, bonusValor, setBonusValor, custoValor, setCustoValor, dadosQtd, setDadosQtd,
        dadosFaces, setDadosFaces, salvarNovoElem, cancelarEdicaoElem, formRef
    } = ctx;

    return (
        <div ref={formRef} style={{ border: '1px dashed currentColor', padding: '20px', borderRadius: '8px', background: 'rgba(0,0,0,0.03)' }}>
            <h3 style={{ marginBottom: 15 }}>{elemEditandoId ? `✎ Reescrevendo: ${nomeElem}` : '✎ Escrever Nova Magia'}</h3>
            
            <input type="text" placeholder="Nome do Feitiço/Técnica..." value={nomeElem} onChange={e => setNomeElem(e.target.value)} style={{ width: '100%', fontSize: '1.2em', fontWeight: 'bold' }} />
            
            <textarea placeholder="Descrição e Efeitos Narrativos (A forma como a magia afeta o tecido da realidade...)" value={descricaoElem} onChange={e => setDescricaoElem(e.target.value)} style={{ width: '100%', minHeight: '80px', marginTop: 15, padding: '10px', resize: 'vertical' }} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 15, marginTop: 15, borderTop: '1px dotted currentColor', paddingTop: 15 }}>
                <div>
                    <label style={{ display: 'block', fontSize: '0.85em', fontWeight: 'bold', opacity: 0.8 }}>Mecânica Primária</label>
                    <select value={tipoMecanica} onChange={e => setTipoMecanica(e.target.value)} style={{ width: '100%' }}>
                        <option value="ataque">Rolagem de Acerto</option>
                        <option value="saving">Alvo Rola Saving Throw</option>
                        <option value="infusao">Infusão / Buff</option>
                        <option value="suporte">Suporte / Cura</option>
                    </select>
                </div>
                {tipoMecanica === 'saving' && (
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85em', fontWeight: 'bold', opacity: 0.8 }}>Resistência Alvo</label>
                        <select value={savingAttr} onChange={e => setSavingAttr(e.target.value)} style={{ width: '100%' }}>
                            <option value="forca">Força</option><option value="destreza">Destreza</option><option value="constituicao">Constituição</option>
                            <option value="sabedoria">Sabedoria</option><option value="inteligencia">Inteligência</option><option value="stamina">Stamina</option>
                            <option value="carisma">Carisma</option><option value="energiaEsp">Energia Espiritual</option>
                        </select>
                    </div>
                )}
                <div>
                    <label style={{ display: 'block', fontSize: '0.85em', fontWeight: 'bold', opacity: 0.8 }}>Combustível (Energia)</label>
                    <select value={energiaCombustao} onChange={e => setEnergiaCombustao(e.target.value)} style={{ width: '100%' }}>
                        {allowedEnergies.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '0.85em', fontWeight: 'bold', opacity: 0.8 }}>Alcance (Q)</label>
                    <input type="number" min="0" step="0.5" value={alcanceQuad} onChange={e => setAlcanceQuad(e.target.value)} style={{ width: '100%', textAlign: 'center' }} />
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '0.85em', fontWeight: 'bold', opacity: 0.8 }}>Afeta/Consome</label>
                    <input type="text" placeholder="Ex: Fogo, Ilusões" value={elementosAfetados} onChange={e => setElementosAfetados(e.target.value)} style={{ width: '100%' }} />
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 15, marginTop: 15, borderTop: '1px dotted currentColor', paddingTop: 15 }}>
                <div>
                    <label style={{ display: 'block', fontSize: '0.85em', fontWeight: 'bold', opacity: 0.8 }}>Raio / Área (Q)</label>
                    <input type="number" min="0" step="0.5" value={areaQuad} onChange={e => setAreaQuad(e.target.value)} style={{ width: '100%', textAlign: 'center' }} />
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '0.85em', fontWeight: 'bold', opacity: 0.8 }}>Filtro de Área</label>
                    <select value={alvosAfetados} onChange={e => setAlvosAfetados(e.target.value)} style={{ width: '100%' }}>
                        <option value="todos">Todos na Área</option>
                        <option value="inimigos">Apenas Inimigos</option>
                        <option value="aliados">Apenas Aliados</option>
                    </select>
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '0.85em', fontWeight: 'bold', opacity: 0.8 }}>Duração (Turnos)</label>
                    <input type="number" min="0" value={duracaoZona} onChange={e => setDuracaoZona(e.target.value)} style={{ width: '100%', textAlign: 'center' }} />
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 15, marginTop: 15, borderTop: '1px dotted currentColor', paddingTop: 15 }}>
                <div><label style={{ display: 'block', fontSize: '0.8em', opacity: 0.7 }}>Atributo Bônus</label><select value={bonusTipo} onChange={e => setBonusTipo(e.target.value)} style={{width:'100%'}}>{BONUS_OPTIONS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}</select></div>
                <div><label style={{ display: 'block', fontSize: '0.8em', opacity: 0.7 }}>Valor Numérico</label><input type="text" value={bonusValor} onChange={e => setBonusValor(e.target.value)} disabled={bonusTipo === 'nenhum'} style={{width:'100%', textAlign:'center'}} /></div>
                <div><label style={{ display: 'block', fontSize: '0.8em', opacity: 0.7 }}>Custo (%)</label><input type="number" value={custoValor} onChange={e => setCustoValor(e.target.value)} disabled={energiaCombustao === 'livre'} style={{width:'100%', textAlign:'center'}} /></div>
                <div><label style={{ display: 'block', fontSize: '0.8em', opacity: 0.7 }}>Extra (Qtd Dados)</label><input type="number" value={dadosQtd} onChange={e => setDadosQtd(e.target.value)} style={{width:'100%', textAlign:'center'}} /></div>
                <div><label style={{ display: 'block', fontSize: '0.8em', opacity: 0.7 }}>Extra (Faces)</label><input type="number" value={dadosFaces} onChange={e => setDadosFaces(e.target.value)} style={{width:'100%', textAlign:'center'}} /></div>
            </div>
            
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button onClick={salvarNovoElem} style={{ flex: 1, padding: '10px' }}>{elemEditandoId ? '✍️ Concluir Revisão' : '📜 Gravar no Grimório'}</button>
                {elemEditandoId && <button onClick={cancelarEdicaoElem} style={{ padding: '10px', width: '100px', opacity: 0.8 }}>Cancelar</button>}
            </div>
        </div>
    );
}

export function ElementosMagiaCard({ magia }) {
    const ctx = useElementosForm();

    if (!ctx) return null;
    const { toggleEquiparElem, editarElem, deletarElem, profGlobal, getModificadorDoisDigitos, minhaFicha, elementosInatos } = ctx;

    const elemText = magia.elemento || 'Neutro';
    const energiaAtiva = magia.energiaCombustao;
    const isInato = elementosInatos.includes(elemText.toLowerCase().trim());

    // 🎓 Antes lia ficha.dominios.elementais[elemText] — um caminho aninhado que nunca tinha
    // nenhuma UI escrevendo nele (resíduo de uma estrutura antiga, sempre 0/sem efeito). Agora lê
    // o MESMO Domínio real da Hierarquia (página 3 da Ficha) que já alimenta Overcharge/Fadiga/
    // Resistência Elemental em Poderes — ver core/dominios.js.
    const nivelDom = getNivelDominio(minhaFicha, elemText);
    const infoDom = NIVEIS_DOMINIO[nivelDom];

    // 🛡️ Quanto esse Domínio protege o personagem quando ELE é o alvo de um golpe deste elemento:
    // Resistência (desconto de Fadiga em golpes de Overcharge/combate) e Redução de Dano bruto
    // (calcularReducaoDanoElemental) — mostrado no "melhor caso" (contra um atacante sem nenhum
    // Domínio, nível 0), já que a redução real depende do Domínio de quem golpeia (ver
    // core/dominios.js > calcularReducaoDanoElemental).
    const resistenciaPct = Math.round(getFracaoDominio(minhaFicha, elemText) * 100);
    const reducaoDanoMaxPct = Math.round(calcularReducaoDanoElemental(nivelDom, 0) * 100);

    let redCustoMult = 1;
    if (nivelDom >= 9) redCustoMult = 0;
    else if (nivelDom >= 8) redCustoMult = 0.50; 
    else if (nivelDom >= 5) redCustoMult = 0.75; 
    else if (nivelDom >= 3) redCustoMult = 0.90; 
    else if (nivelDom >= 2) redCustoMult = 0.95; 

    const isEquipped = magia.equipado;
    const corPura = cores[elemText] || 'currentColor';

    const bTipo = magia.bonusTipo || 'nenhum';
    const propText = bTipo === 'nenhum' ? 'Básico' : bTipo.replace('_', ' ').toUpperCase();
    const bValorStr = bTipo === 'nenhum' ? '' : `: ${bTipo.includes('mult_') ? 'x' : '+'}${magia.bonusValor || 0}`;
    const dadosStr = magia.dadosExtraQtd > 0 ? ` | Dados Extra: +${magia.dadosExtraQtd}d${magia.dadosExtraFaces || 20}` : '';
    
    const custoFinal = isInato ? 0 : (magia.custoValor * redCustoMult);
    let txtCusto = `${custoFinal}% (${energiaAtiva?.toUpperCase()})`;
    if (isInato) txtCusto = `Livre (Ressonância Inata)`;
    else if (nivelDom >= 9) txtCusto = `Livre (Domínio Absoluto)`;
    else if (magia.custoValor === 0 || isNaN(magia.custoValor)) txtCusto = `Livre`;

    const mec = magia.tipoMecanica || 'ataque';
    const alvoStr = magia.alvosAfetados === 'inimigos' ? 'Inimigos' : magia.alvosAfetados === 'aliados' ? 'Aliados' : 'Todos';
    const durStr = magia.duracaoZona > 0 ? `${magia.duracaoZona} Turnos` : 'Instantâneo';
    
    let regente = 'inteligencia';
    let modBase = 0;
    if (energiaAtiva === 'corpo') {
        const modForca = getModificadorDoisDigitos('forca');
        const modDestreza = getModificadorDoisDigitos('destreza');
        modBase = Math.max(modForca, modDestreza);
    } else {
        const energiaToAttr = { 'mana': 'inteligencia', 'aura': 'energiaEsp', 'chakra': 'stamina', 'pontosVitais': 'constituicao', 'pontosMortais': 'inteligencia', 'livre': 'inteligencia', 'flexivel': 'inteligencia' };
        regente = energiaToAttr[energiaAtiva || 'mana'] || 'inteligencia';
        modBase = getModificadorDoisDigitos(regente);
    }

    const cd = 8 + modBase + profGlobal;
    const bonusAcerto = modBase + profGlobal;

    return (
        <div style={{ 
            border: isEquipped ? `2px solid ${corPura}` : `1px dashed currentColor`, 
            background: isEquipped ? 'rgba(0,0,0,0.05)' : 'transparent', 
            opacity: isEquipped ? 1 : 0.7,
            marginTop: 15, padding: 15, borderRadius: '6px', position: 'relative',
            transition: 'all 0.3s ease'
        }}>
            
            {magia.notasIA && (
                <div style={{ padding: '4px 10px', fontSize: '0.85em', fontStyle: 'italic', borderBottom: '1px dashed currentColor', marginBottom: '10px', opacity: 0.8 }}>
                    <strong>Anotação Adicional:</strong> {magia.notasIA}
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 15 }}>
                <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, color: corPura, fontSize: '1.4em', fontWeight: 'bold' }}>
                        {emogis[elemText] || '\u2728'} {magia.nome || 'Magia'} <span style={{fontSize: '0.6em', opacity: 0.6, color: 'inherit'}}>(Alcance: {magia.alcanceQuad || 1}Q)</span>
                    </h3>
                    
                    {magia.descricao && (
                        <p style={{ fontSize: '0.9em', fontStyle: 'italic', margin: '8px 0', opacity: 0.8 }}>
                            "{magia.descricao}"
                        </p>
                    )}

                    <div style={{ fontSize: '0.9em', marginTop: '10px', opacity: 0.9 }}>
                        <strong>Mecânica:</strong> {mec.toUpperCase()} {mec === 'saving' ? `(CD ${cd} - ${magia.savingAttr?.toUpperCase()})` : mec === 'ataque' ? `(+${bonusAcerto} Acerto)` : ''}
                        <br/>
                        {magia.areaQuad > 0 && <span><strong>Área:</strong> {magia.areaQuad}Q | <strong>Alvos:</strong> {alvoStr} | <strong>Zona:</strong> {durStr}<br/></span>}
                        {magia.elementosAfetados && <span><strong>Reage com:</strong> {magia.elementosAfetados}<br/></span>}
                    </div>

                    {infoDom && (
                        <div style={{ borderLeft: `3px solid ${infoDom.cor}`, paddingLeft: '8px', marginTop: '10px', opacity: 0.9 }}>
                            <span style={{ color: infoDom.cor, fontWeight: 'bold', fontSize: '0.85em' }}>Mestre (Nv. {nivelDom} - {infoDom.nome})</span>
                            <br/>
                            <span style={{ fontSize: '0.8em', fontStyle: 'italic' }}>{infoDom.desc}</span>
                            {nivelDom > 0 && (
                                <div style={{ fontSize: '0.8em', marginTop: '4px', opacity: 0.85 }}>
                                    🛡️ Resistência a {elemText}: <strong>{resistenciaPct}%</strong>
                                    {' '}| Redução de Dano (máx., vs. Domínio 0): <strong>{reducaoDanoMaxPct}%</strong>
                                </div>
                            )}
                        </div>
                    )}

                    <div style={{ fontSize: '0.85em', marginTop: '10px', opacity: 0.7, borderTop: '1px dotted currentColor', paddingTop: '5px' }}>
                        <strong>Bônus:</strong> {propText}{bValorStr}{dadosStr} <br/>
                        <strong>Custo:</strong> {txtCusto}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: '120px' }}>
                    <button style={{ padding: '8px', fontWeight: 'bold', border: `2px solid ${isEquipped ? corPura : 'currentColor'}`, color: isEquipped ? corPura : 'inherit', opacity: isEquipped ? 1 : 0.6 }} onClick={() => toggleEquiparElem(magia.id)}>
                        {isEquipped ? '★ MEMORIZADA' : 'Preparar Magia'}
                    </button>
                    <div style={{ display: 'flex', gap: 5 }}>
                        <button style={{ flex: 1, padding: '4px', fontSize: '0.8em' }} onClick={() => editarElem(magia.id)}>Reescrever</button>
                        <button style={{ flex: 1, padding: '4px', fontSize: '0.8em', opacity: 0.6 }} onClick={() => deletarElem(magia.id)}>Rasgar</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ElementosMagiaLista() {
    const ctx = useElementosForm();
    if (!ctx) return FALLBACK;
    const { elemSelecionado, magiasDoGrupo, magiasConjuradasOutros } = ctx;

    return (
        <div style={{ marginTop: '20px' }}>
            {magiasDoGrupo.length > 0 ? (
                <>
                    <h3 style={{ fontSize: '1.2em', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '2px solid currentColor', paddingBottom: '5px' }}>
                        {emogis[elemSelecionado] || '\u2728'} Pergaminhos de {elemSelecionado}
                    </h3>
                    {magiasDoGrupo.map(p => <ElementosMagiaCard key={p.id} magia={p} />)}
                </>
            ) : (
                <p style={{ opacity: 0.5, fontStyle: 'italic', marginTop: 20, textAlign: 'center' }}>Nenhum escrito ou técnica mágica de {elemSelecionado} foi encontrado neste capítulo...</p>
            )}

            {magiasConjuradasOutros.length > 0 && (
                <>
                    <h3 style={{ fontSize: '1.2em', opacity: 0.8, marginTop: '40px', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '2px dotted currentColor', paddingBottom: '5px' }}>
                        Outras Magias Preparadas
                    </h3>
                    {magiasConjuradasOutros.map(p => <ElementosMagiaCard key={p.id} magia={p} />)}
                </>
            )}
        </div>
    );
}