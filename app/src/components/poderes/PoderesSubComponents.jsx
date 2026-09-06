import React, { useState } from 'react';
import { usePoderesForm, SINGULAR } from './PoderesFormContext';
import { ATRIBUTOS_AGRUPADOS, PROPRIEDADE_OPTIONS } from '../../core/efeitos-constants';
import FormasEditor from '../shared/FormasEditor';

const FALLBACK = <div style={{ opacity: 0.5, padding: 10 }}>Poderes provider não encontrado</div>;

// 🔥 Só nesta aba (Habilidades/Formas/Poderes do Grimório): "PODER (Direto)" multiplica o Poder do
// Scouter diretamente, sem passar por nenhum Status/Energia/Vida — não existe em ArsenalPanel/
// FormasEditor porque só o Grimório (ficha.poderes) é lido por getPoderDiretoMultiplier (Marcados.jsx).
const ATRIBUTOS_PODERES = [
    ...ATRIBUTOS_AGRUPADOS,
    { label: '⚡ POTÊNCIA DO SCOUTER', options: ['poder_direto'] }
];

// Exportada pra reuso no seletor "Elemento do Dano" do Dano Rápido do Mestre (ver
// MapaFerramentasMestre.jsx > MapaMestreDanoRapido) — mesma grafia usada nas Técnicas Elementais
// aqui, essencial pra bater com o nome do Domínio treinado na Hierarquia (página 3 da Ficha).
export const ELEMENTOS_OPCOES = [
    { label: 'Elementos Básicos', opcoes: ['Fogo', 'Agua', 'Raio', 'Terra', 'Vento'] },
    { label: 'Básicos Verdadeiros', opcoes: ['Fogo Verdadeiro', 'Agua Verdadeira', 'Raio Verdadeiro', 'Terra Verdadeira', 'Vento Verdadeiro'] },
    { label: 'Elementos Avançados', opcoes: ['Solar', 'Energia', 'Gelo', 'Vacuo', 'Natureza'] },
    { label: 'Avançados Verdadeiros', opcoes: ['Solar Verdadeiro', 'Energia Verdadeira', 'Gelo Verdadeiro', 'Vacuo Verdadeiro', 'Natureza Verdadeira'] },
    { label: 'Elementos Primordiais', opcoes: ['Luz', 'Trevas', 'Ether', 'Celestial', 'Infernal', 'Caos', 'Criacao', 'Destruicao', 'Cosmos'] },
    { label: 'Elementos Astrais', opcoes: ['Vida', 'Morte', 'Vazio'] },
    { label: 'Kekkei Genkai / Touta', opcoes: ['Elemento Madeira', 'Elemento Mineral', 'Elemento Cinzas', 'Elemento Igneo', 'Elemento Lava', 'Elemento Vapor', 'Elemento Nevoa', 'Elemento Tempestade', 'Elemento Areia', 'Elemento Tufao', 'Elemento Velocidade', 'Elemento Poeira', 'Elemento Calor', 'Elemento Cal', 'Elemento Carbono', 'Elemento Veneno', 'Elemento Magnetismo', 'Elemento Som'] },
    { label: 'Magias Ancestrais', opcoes: ['Truques Ancestrais', 'Magia de Sangue', 'Magia de Osso', 'Magia Draconica', 'Magia de Borracha', 'Magia de Espelho', 'Magia de Sal', 'Magia de Alma', 'Magia de Tremor', 'Magia de Gravidade', 'Magia de Tempo', 'Magia de Equipamento', 'Magia de Explosao', 'Magia Espacial', 'Magia de Metamorfose'] },
    { label: 'Magias Arcanas/Negras', opcoes: ['Truques Arcanos/Negros', 'Magias Arcanas/Negra de 1º Ciclo', 'Magias Arcanas/Negra de 2º Ciclo', 'Magias Arcanas/Negra de 3º Ciclo', 'Magias Arcanas/Negra de 4º Ciclo', 'Magias Arcanas/Negra de 5º Ciclo', 'Magias Arcanas/Negra de 6º Ciclo', 'Magias Arcanas/Negra de 7º Ciclo', 'Magias Arcanas/Negra de 8º Ciclo', 'Magias Arcanas/Negra de 9º Ciclo', 'Magias Arcanas/Negra de 10º Ciclo'] },
    { label: 'Magias de Ciclo', opcoes: ['Truques de Ciclo', 'Magias de 1º Ciclo', 'Magias de 2º Ciclo', 'Magias de 3º Ciclo', 'Magias de 4º Ciclo', 'Magias de 5º Ciclo', 'Magias de 6º Ciclo', 'Magias de 7º Ciclo', 'Magias de 8º Ciclo', 'Magias de 9º Ciclo', 'Magias de 10º Ciclo'] },
    { label: 'Manifestações e Fusões', opcoes: ['Aura Pura', 'Projeção de Aura', 'Artes Marciais', 'Reforço Físico', 'Fusões Básicas', 'Fusões Avançadas'] }
];

export function PoderesImportadorIA() {
    const ctx = usePoderesForm();
    const [aberto, setAberto] = useState(false);
    const [textoDocs, setTextoDocs] = useState('');
    const [jsonResposta, setJsonResposta] = useState('');
    const [fase, setFase] = useState(1); 

    if (!ctx) return null;
    const { injetarJsonDaIA } = ctx;

    const gerarPrompt = () => {
        if (!textoDocs.trim()) return alert("Cole o texto primeiro!");
        
        const prompt = `Atue como extrator de dados de RPG.
Transforme TODAS as habilidades descritas no texto abaixo em itens dentro do array "poderes". 
Mesmo que a habilidade use fogo, gelo ou magia, COLOQUE-A EM "poderes", pois o usuário quer registrá-la nesta aba específica.
Extraia o dano (ex: "15d6" vira danoQtd: 15 e danoFaces: 6).
Se houver efeitos complexos de paralisia ou condições, coloque no campo "notasIA".

TEXTO:
${textoDocs}

RETORNE EXATAMENTE UM JSON PURO:
{
  "poderes": [{ "nome": "X", "descricao": "Y", "danoQtd": 0, "danoFaces": 0, "notasIA": "" }]
}`;
        navigator.clipboard.writeText(prompt);
        alert("Instrução copiada! Cole na sua IA e traga o JSON gerado.");
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
                            <textarea value={textoDocs} onChange={e => setTextoDocs(e.target.value)} placeholder="Cole aqui os textos longos..." style={{ width: '100%', height: '120px', background: 'transparent', padding: '10px', resize: 'vertical' }} />
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

// 🔥 SUBSTITUI A SIDEBAR ANTIGA POR UM ÍNDICE NO TOPO DO LIVRO 🔥
export function PoderesNavegacaoLivro() {
    const ctx = usePoderesForm();
    if (!ctx) return FALLBACK;
    const { abaAtual, setAbaAtual, cancelarEdicaoPoder } = ctx;

    return (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', borderBottom: '2px dashed currentColor', paddingBottom: '15px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <button 
                onClick={() => { setAbaAtual('habilidade'); cancelarEdicaoPoder(); }} 
                style={{ padding: '8px 20px', border: abaAtual === 'habilidade' ? '2px solid currentColor' : '1px dashed currentColor', opacity: abaAtual === 'habilidade' ? 1 : 0.6, fontSize: '1.1em' }}
            >
                🗡️ Habilidades
            </button>
            <button 
                onClick={() => { setAbaAtual('forma'); cancelarEdicaoPoder(); }} 
                style={{ padding: '8px 20px', border: abaAtual === 'forma' ? '2px solid currentColor' : '1px dashed currentColor', opacity: abaAtual === 'forma' ? 1 : 0.6, fontSize: '1.1em' }}
            >
                🎭 Formas
            </button>
            <button 
                onClick={() => { setAbaAtual('poder'); cancelarEdicaoPoder(); }} 
                style={{ padding: '8px 20px', border: abaAtual === 'poder' ? '2px solid currentColor' : '1px dashed currentColor', opacity: abaAtual === 'poder' ? 1 : 0.6, fontSize: '1.1em' }}
            >
                ✨ Poderes
            </button>
        </div>
    );
}

export function PoderesFormEditor() {
    const ctx = usePoderesForm();
    if (!ctx) return FALLBACK;
    const { 
        abaAtual, poderEditandoId, nomePoder, setNomePoder,
        poderVertente, setPoderVertente, poderElemento, setPoderElemento,
        elementosAfetados, setElementosAfetados, 
        imagemUrl, setImagemUrl, uploadingImg, handleImageUpload,
        dadosQtd, setDadosQtd, dadosFaces, setDadosFaces,
        custoPercentual, setCustoPercentual, poderAlcance, setPoderAlcance,
        poderArea, setPoderArea, armaVinculada, setArmaVinculada,
        maestriaPoder, setMaestriaPoder, fadigaPorUsoPoder, setFadigaPorUsoPoder,
        maestriaRequeridaPoder, setMaestriaRequeridaPoder,
        pastaPoder, setPastaPoder, pastasExistentes,
        descricaoPoder, setDescricaoPoder,
        nomeEfeito, setNomeEfeito, novoAtr, setNovoAtr, novoProp, setNovoProp, novoVal, setNovoVal,
        addEfeitoTemp, efeitosTemp, removerEfeitoTemp,
        nomeEfeitoPassivo, setNomeEfeitoPassivo, novoAtrPassivo, setNovoAtrPassivo,
        novoPropPassivo, setNovoPropPassivo, novoValPassivo, setNovoValPassivo,
        addEfeitoPassivoTemp, efeitosTempPassivos, removerEfeitoPassivoTemp,
        salvarNovoPoder, cancelarEdicaoPoder, formRef, minhaFicha
    } = ctx;

    const sing = SINGULAR[abaAtual] || 'Poder/Habilidade';

    return (
        <div ref={formRef} style={{ border: '1px dashed currentColor', padding: '20px', borderRadius: '8px', background: 'rgba(0,0,0,0.03)' }}>
            <h3 style={{ marginBottom: 15 }}>{poderEditandoId ? `✎ Reescrevendo: ${nomePoder}` : `✎ Criar Novo(a) ${sing}`}</h3>
            
            <input type="text" placeholder={`Nome (Ex: Chama Imortal)`} value={nomePoder} onChange={e => setNomePoder(e.target.value)} style={{ width: '100%', fontSize: '1.2em', fontWeight: 'bold' }} />
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, marginTop: 15 }}>
                <div>
                    <label style={{ display: 'block', fontSize: '0.85em', fontWeight: 'bold', opacity: 0.8 }}>Natureza da Magia</label>
                    <select value={poderVertente} onChange={e => setPoderVertente(e.target.value)} style={{ width: '100%' }}>
                        <option value="">Padrão (Dano / Efeito Direto)</option>
                        <option value="Acumulativo">📈 Acumulativo (Requer Marcadores/Forja)</option>
                        <option value="Elemental">🌪️ Elemental (Ressonância Ativa)</option>
                        <option value="Conceitual">🧩 Conceitual (Distorção de Regras)</option>
                        <option value="Utilitario">🛠️ Utilitário (Cópia / Suporte)</option>
                    </select>
                </div>

                {(poderVertente || '').toLowerCase().includes('elemental') && (
                    <div className="fade-in" style={{ display: 'flex', gap: '10px', gridColumn: 'span 2' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '0.85em', fontWeight: 'bold', opacity: 0.8 }}>Elemento Principal</label>
                            <select value={poderElemento} onChange={e => setPoderElemento(e.target.value)} style={{ width: '100%' }}>
                                <option value="">Selecione a raiz elemental...</option>
                                {ELEMENTOS_OPCOES.map(grupo => (
                                    <optgroup key={grupo.label} label={grupo.label}>
                                        {grupo.opcoes.map(el => <option key={el} value={el}>{el}</option>)}
                                    </optgroup>
                                ))}
                            </select>
                        </div>
                        
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '0.85em', fontWeight: 'bold', opacity: 0.8 }}>Afeta/Consome</label>
                            <input type="text" placeholder="Quais elementos engole?" value={elementosAfetados} onChange={e => setElementosAfetados(e.target.value)} style={{ width: '100%' }} />
                        </div>
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 15, borderTop: '1px dotted currentColor', paddingTop: 15 }}>
                <input type="text" placeholder="URL da Imagem..." value={imagemUrl} onChange={e => setImagemUrl(e.target.value)} style={{ flex: 1, margin: 0 }} />
                <label style={{ cursor: 'pointer', padding: '8px 15px', border: '1px dashed currentColor', borderRadius: '4px', whiteSpace: 'nowrap', opacity: uploadingImg ? 0.5 : 0.8 }}>
                    {uploadingImg ? 'Enviando...' : '📁 Anexar'}
                    <input type="file" accept="image/png, image/jpeg, image/gif, image/webp" onChange={handleImageUpload} style={{ display: 'none' }} disabled={uploadingImg} />
                </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 15, marginTop: 15 }}>
                <div><label style={{ display: 'block', fontSize: '0.8em', opacity: 0.7 }}>Qtd Dados</label><input type="number" min="0" value={dadosQtd} onChange={e => setDadosQtd(e.target.value)} style={{width:'100%', textAlign:'center'}} /></div>
                <div><label style={{ display: 'block', fontSize: '0.8em', opacity: 0.7 }}>Faces (d)</label><input type="number" min="1" value={dadosFaces} onChange={e => setDadosFaces(e.target.value)} style={{width:'100%', textAlign:'center'}} /></div>
                <div><label style={{ display: 'block', fontSize: '0.8em', opacity: 0.7 }}>Custo (%)</label><input type="number" min="0" value={custoPercentual} onChange={e => setCustoPercentual(e.target.value)} style={{width:'100%', textAlign:'center'}} /></div>
                <div><label style={{ display: 'block', fontSize: '0.8em', opacity: 0.7 }}>Alcance (Q)</label><input type="number" min="0" step="0.5" value={poderAlcance} onChange={e => setPoderAlcance(e.target.value)} style={{width:'100%', textAlign:'center'}} /></div>
                <div><label style={{ display: 'block', fontSize: '0.8em', opacity: 0.7 }}>Área (Q)</label><input type="number" min="0" step="0.5" value={poderArea} onChange={e => setPoderArea(e.target.value)} style={{width:'100%', textAlign:'center'}} /></div>
                <div>
                    <label style={{ display: 'block', fontSize: '0.8em', opacity: 0.7 }}>Arma (Opc.)</label>
                    <select value={armaVinculada} onChange={e => setArmaVinculada(e.target.value)} style={{width:'100%'}}>
                        <option value="">Livre</option>
                        {(minhaFicha?.inventario || []).filter(i => i.tipo === 'arma').map(arma => (
                            <option key={arma.id} value={String(arma.id)}>{arma.nome}</option>
                        ))}
                    </select>
                </div>
                {abaAtual === 'forma' && (
                    <div className="fade-in">
                        <label style={{ display: 'block', fontSize: '0.8em', opacity: 0.7, color: '#00ff88' }} title="Define até quanto de Poder liberado (Supressão) o personagem pode usar com esta Forma ativa sem acumular Fadiga. 100% = Forma dominada, nunca gera Fadiga por Poder.">🥋 Maestria (%)</label>
                        <input
                            type="number" min="0" max="100" value={maestriaPoder}
                            onChange={e => { const v = parseFloat(e.target.value); setMaestriaPoder(isNaN(v) ? 0 : Math.min(100, Math.max(0, v))); }}
                            style={{ width: '100%', textAlign: 'center', borderColor: '#00ff88', color: '#00ff88' }}
                        />
                    </div>
                )}
                {abaAtual === 'forma' && (
                    <div className="fade-in">
                        <label style={{ display: 'block', fontSize: '0.8em', opacity: 0.7, color: '#ff8800' }} title="O quanto esta Forma pesa na Fadiga dinâmica quando usada ACIMA da própria Maestria. Padrão: 15.">😮‍💨 Fadiga por Uso</label>
                        <input
                            type="number" min="0" value={fadigaPorUsoPoder}
                            onChange={e => { const v = parseFloat(e.target.value); setFadigaPorUsoPoder(isNaN(v) ? 0 : Math.max(0, v)); }}
                            style={{ width: '100%', textAlign: 'center', borderColor: '#ff8800', color: '#ff8800' }}
                        />
                    </div>
                )}
                {(abaAtual === 'habilidade' || abaAtual === 'poder') && (
                    <div className="fade-in">
                        <label style={{ display: 'block', fontSize: '0.8em', opacity: 0.7, color: '#00ff88' }} title={`O quanto o personagem já domina ESTE(A) ${sing} especificamente.`}>🎓 Maestria (%)</label>
                        <input
                            type="number" min="0" max="100" value={maestriaPoder}
                            onChange={e => { const v = parseFloat(e.target.value); setMaestriaPoder(isNaN(v) ? 0 : Math.min(100, Math.max(0, v))); }}
                            style={{ width: '100%', textAlign: 'center', borderColor: '#00ff88', color: '#00ff88' }}
                        />
                    </div>
                )}
                {(abaAtual === 'habilidade' || abaAtual === 'poder') && (
                    <div className="fade-in">
                        <label style={{ display: 'block', fontSize: '0.8em', opacity: 0.7, color: '#ff8800' }} title={`Maestria mínima exigida pra usar este(a) ${sing} sem gerar Fadiga extra. 0 = sem requisito (padrão).`}>🎯 Maestria Requerida (%)</label>
                        <input
                            type="number" min="0" max="100" value={maestriaRequeridaPoder}
                            onChange={e => { const v = parseFloat(e.target.value); setMaestriaRequeridaPoder(isNaN(v) ? 0 : Math.min(100, Math.max(0, v))); }}
                            style={{ width: '100%', textAlign: 'center', borderColor: '#ff8800', color: '#ff8800' }}
                        />
                    </div>
                )}
                <div className="fade-in">
                    <label style={{ display: 'block', fontSize: '0.8em', opacity: 0.7 }} title="Organize Formas, Habilidades e Poderes em pastas. Selecione uma existente ou digite um nome novo.">🗂️ Pasta (Opc.)</label>
                    <input
                        type="text" list="pastas-formas-datalist" placeholder="Sem pasta"
                        value={pastaPoder} onChange={e => setPastaPoder(e.target.value)}
                        style={{ width: '100%', textAlign: 'center' }}
                    />
                    <datalist id="pastas-formas-datalist">
                        {(pastasExistentes || []).map(nome => <option key={nome} value={nome} />)}
                    </datalist>
                </div>
            </div>

            <textarea 
                placeholder="Descrição / Efeito Narrativo..." 
                value={descricaoPoder} 
                onChange={e => setDescricaoPoder(e.target.value)} 
                style={{ width: '100%', minHeight: '80px', marginTop: 15, padding: '10px', resize: 'vertical' }} 
            />

            {/* SEÇÃO MATEMÁTICA ATIVA */}
            <h4 style={{ marginTop: 25, marginBottom: 10, fontSize: '1em', opacity: 0.8, borderBottom: '1px dotted currentColor', paddingBottom: '5px' }}>➕ Efeitos Matemáticos Ativos</h4>
            <input type="text" placeholder="Nome do Efeito" value={nomeEfeito} onChange={e => setNomeEfeito(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <select value={novoAtr} onChange={e => setNovoAtr(e.target.value)} style={{ flex: 1 }}>
                    {ATRIBUTOS_PODERES.map(grupo => (
                        <optgroup key={grupo.label} label={grupo.label}>
                            {grupo.options.map(a => <option key={a} value={a}>{a.replace('_', ' ').toUpperCase()}</option>)}
                        </optgroup>
                    ))}
                </select>
                <select value={novoProp} onChange={e => setNovoProp(e.target.value)} style={{ flex: 1 }}>
                    {PROPRIEDADE_OPTIONS.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                </select>
                <input type="text" placeholder="Valor" value={novoVal} onChange={e => setNovoVal(e.target.value)} style={{ width: '80px', textAlign: 'center' }} />
                <button onClick={addEfeitoTemp} style={{ padding: '8px' }}>+</button>
            </div>

            <div style={{ marginTop: 10 }}>
                {efeitosTemp.map((e, i) => {
                    const isMult = ['mbase', 'mgeral', 'mformas', 'mabs', 'munico'].includes((e.propriedade || '').toLowerCase());
                    return (
                        <div key={i} style={{ fontSize: '0.9em', marginBottom: 5, padding: '5px 10px', borderLeft: '2px solid currentColor', display: 'flex', justifyContent: 'space-between', opacity: 0.9 }}>
                            <span><strong>{e.nome || '(Sem nome)'}</strong> [{(e.atributo || '').replace('_', ' ').toUpperCase()}] - [{(e.propriedade || '').toUpperCase()}]: <strong>{isMult ? '(x)' : '(+)'} {e.valor}</strong></span>
                            <button onClick={() => removerEfeitoTemp(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.6 }}>✖</button>
                        </div>
                    );
                })}
            </div>

            {/* SEÇÃO MATEMÁTICA PASSIVA */}
            <h4 style={{ marginTop: 25, marginBottom: 10, fontSize: '1em', opacity: 0.8, borderBottom: '1px dotted currentColor', paddingBottom: '5px' }}>🛡️ Efeitos Passivos (Sempre Ligados)</h4>
            <input type="text" placeholder="Nome do Efeito Passivo" value={nomeEfeitoPassivo} onChange={e => setNomeEfeitoPassivo(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <select value={novoAtrPassivo} onChange={e => setNovoAtrPassivo(e.target.value)} style={{ flex: 1 }}>
                    {ATRIBUTOS_PODERES.map(grupo => (
                        <optgroup key={grupo.label} label={grupo.label}>
                            {grupo.options.map(a => <option key={a} value={a}>{a.replace('_', ' ').toUpperCase()}</option>)}
                        </optgroup>
                    ))}
                </select>
                <select value={novoPropPassivo} onChange={e => setNovoPropPassivo(e.target.value)} style={{ flex: 1 }}>
                    {PROPRIEDADE_OPTIONS.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                </select>
                <input type="text" placeholder="Valor" value={novoValPassivo} onChange={e => setNovoValPassivo(e.target.value)} style={{ width: '80px', textAlign: 'center' }} />
                <button onClick={addEfeitoPassivoTemp} style={{ padding: '8px' }}>+</button>
            </div>

            <div style={{ marginTop: 10 }}>
                {efeitosTempPassivos.map((e, i) => {
                    const isMult = ['mbase', 'mgeral', 'mformas', 'mabs', 'munico'].includes((e.propriedade || '').toLowerCase());
                    return (
                        <div key={i} style={{ fontSize: '0.9em', marginBottom: 5, padding: '5px 10px', borderLeft: '2px solid currentColor', display: 'flex', justifyContent: 'space-between', opacity: 0.8 }}>
                            <span>[PASSIVO] <strong>{e.nome || '(Sem nome)'}</strong> [{(e.atributo || '').replace('_', ' ').toUpperCase()}] - [{(e.propriedade || '').toUpperCase()}]: <strong>{isMult ? '(x)' : '(+)'} {e.valor}</strong></span>
                            <button onClick={() => removerEfeitoPassivoTemp(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.6 }}>✖</button>
                        </div>
                    );
                })}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 25 }}>
                <button onClick={salvarNovoPoder} style={{ flex: 1, padding: '10px' }}>{poderEditandoId ? '✍️ Concluir Revisão' : `📜 Gravar no Grimório`}</button>
                {poderEditandoId && <button onClick={cancelarEdicaoPoder} style={{ padding: '10px', width: '100px', opacity: 0.8 }}>Cancelar</button>}
            </div>
        </div>
    );
}

// 🗂️ Nome do "bucket" pra itens sem pasta atribuída — nunca colide com um nome de pasta real
// porque pastaPoder é sempre .trim()'ado antes de salvar (nunca fica só espaços).
const SEM_PASTA = 'Sem Pasta';

// 🗂️ Plural com artigo de cada categoria, pro texto do prompt de renomear pasta (Pasta deixou de
// ser exclusiva de Forma — este texto não pode mais dizer "Formas" fixo quando quem está
// renomeando está na aba Habilidades ou Poderes).
const PLURAL_COM_ARTIGO = { habilidade: 'as Habilidades', forma: 'as Formas', poder: 'os Poderes' };

export function PoderesLista() {
    const ctx = usePoderesForm();
    if (!ctx) return FALLBACK;
    const {
        abaAtual, itensFiltrados, poderPreparandoId, setPoderPreparandoId,
        setOverchargeAtivo, togglePoder, vincularAberto, setVincularAberto,
        vincularRef, minhaFicha, armasEquipadas, vincularArmaAoPoder,
        editarPoder, deletarPoder, overchargeAtivo, curMana, curAura, curChakra,
        energiaElemental, mPotencial, danoBruto, dispararAtaque,
        salvarFormaPoder, deletarFormaPoder, ativarFormaPoder,
        renomearPastaForma
    } = ctx;

    const [pastasFechadas, setPastasFechadas] = useState({});
    // Namespaced por categoria (abaAtual::nome) — sem isso, recolher "Combos" na aba Habilidades
    // também recolheria uma pasta "Combos" de outra categoria que reusasse o mesmo nome.
    const toggleFechada = (nome) => setPastasFechadas(prev => ({ ...prev, [`${abaAtual}::${nome}`]: !prev[`${abaAtual}::${nome}`] }));

    const sing = SINGULAR[abaAtual] || 'Poder/Habilidade';

    const renomearOuRemoverPasta = (nomeAtual) => {
        const plural = PLURAL_COM_ARTIGO[abaAtual] || 'os itens';
        const novo = window.prompt(`Renomear a pasta "${nomeAtual}" (deixe em branco pra remover a pasta e soltar ${plural} em "${SEM_PASTA}"):`, nomeAtual);
        if (novo === null) return;
        // Escopado só à categoria atual (abaAtual) — renomear uma pasta na aba Habilidades nunca
        // deve afetar sem querer uma Forma/Poder que reusa o mesmo nome de pasta.
        renomearPastaForma(nomeAtual, novo, abaAtual);
    };

    const renderItem = (p) => {
            if (!p) return null;
                    const isEquipped = p.ativa;
                    const txtArr = (p.efeitos || []).map(e => {
                        if (!e) return '';
                        return `[${(e.atributo || '').replace('_', ' ').toUpperCase()}] ${(e.propriedade || '').toUpperCase()}: +${e.valor || 0}`;
                    }).filter(Boolean);
                    
                    const pVertenteLower = (p.vertente || '').toLowerCase();
                    
                    const percBase = p.custoPercentual || 0;
                    const percDec = percBase / 100;
                    const manaUsada = Math.floor(curMana * percDec);
                    const auraUsada = Math.floor(curAura * percDec);
                    const chakraUsado = Math.floor(curChakra * percDec);
                    const energiaExtraida = manaUsada + auraUsada + chakraUsado;

                    const overDec = (percBase * 2) / 100;
                    const energiaOver = Math.floor(curMana * overDec) + Math.floor(curAura * overDec) + Math.floor(curChakra * overDec);
                    
                    return (
                        <div key={p.id} style={{ 
                            border: isEquipped ? `2px solid currentColor` : `1px dashed currentColor`, 
                            background: isEquipped ? 'rgba(0,0,0,0.05)' : 'transparent', 
                            opacity: isEquipped ? 1 : 0.7,
                            marginTop: 15, padding: 15, borderRadius: '6px', position: 'relative',
                            transition: 'all 0.3s ease'
                        }}>
                            
                            {p.notasIA && (
                                <div style={{ padding: '4px 10px', fontSize: '0.85em', fontStyle: 'italic', borderBottom: '1px dashed currentColor', marginBottom: '10px', opacity: 0.8 }}>
                                    <strong>Anotação Adicional:</strong> {p.notasIA}
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 15 }}>
                                <div style={{ flex: 1 }}>
                                    <h3 style={{ margin: 0, fontSize: '1.4em', fontWeight: 'bold' }}>
                                        {p.nome || 'Poder'} 
                                        <span style={{fontSize: '0.6em', opacity: 0.6, fontWeight: 'normal'}}> (Alcance: {p.alcance || 1}Q)</span>
                                        {p.vertente && (
                                            <span style={{ marginLeft: '10px', fontSize: '0.55em', padding: '2px 8px', borderRadius: '10px', border: '1px solid currentColor', opacity: 0.8 }}>
                                                {pVertenteLower.includes('elemental') ? `🌪️ ELEMENTAL: ${p.elemento || '?'}` : p.vertente.toUpperCase()}
                                            </span>
                                        )}
                                        {(p.categoria || '').toLowerCase() === 'forma' && (parseFloat(p.maestria) || 0) > 0 && (
                                            <span style={{ marginLeft: '10px', fontSize: '0.55em', padding: '2px 8px', borderRadius: '10px', border: '1px solid #00ff88', color: '#00ff88', opacity: 0.9 }} title="Livre de Fadiga por Poder até este tanto de Supressão liberada, enquanto esta Forma estiver ativa">
                                                🥋 {Math.min(100, Math.max(0, parseFloat(p.maestria) || 0))}% MAESTRIA
                                            </span>
                                        )}
                                        {(p.categoria || '').toLowerCase() === 'forma' && (
                                            <span style={{ marginLeft: '10px', fontSize: '0.55em', padding: '2px 8px', borderRadius: '10px', border: '1px solid #ff8800', color: '#ff8800', opacity: 0.9 }} title="Peso de Fadiga gerado por uso acima da Maestria">
                                                😮‍💨 {p.fadigaPorUso !== undefined ? p.fadigaPorUso : 15} FADIGA/USO
                                            </span>
                                        )}
                                    </h3>
                                    
                                    {p.descricao && (
                                        <p style={{ fontSize: '0.9em', fontStyle: 'italic', margin: '8px 0', opacity: 0.8 }}>
                                            "{p.descricao}"
                                        </p>
                                    )}
                                    
                                    {p.elementosAfetados && (
                                        <p style={{ fontSize: '0.85em', margin: '4px 0', fontWeight: 'bold', opacity: 0.9 }}>
                                            🌊 Consome/Afeta: {p.elementosAfetados}
                                        </p>
                                    )}

                                    <div style={{ fontSize: '0.85em', marginTop: '10px', opacity: 0.7, borderTop: '1px dotted currentColor', paddingTop: '5px' }}>
                                        <strong>Mecânica:</strong> {txtArr.join(' | ') || 'Sem bônus matemático.'}
                                        {(p.efeitosPassivos || []).length > 0 && (
                                            <span style={{ display: 'block', marginTop: '4px', fontStyle: 'italic' }}>
                                                {(p.efeitosPassivos || []).map(e => {
                                                    if (!e) return '';
                                                    return `[PASSIVO] [${(e.atributo || '').replace('_', ' ').toUpperCase()}] ${(e.propriedade || '').toUpperCase()}: +${e.valor || 0}`;
                                                }).filter(Boolean).join(' | ')}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: '120px' }}>
                                    
                                    {/* BOTÃO ATIVAR/DESATIVAR MAGIA COMPLETA */}
                                    <button 
                                        style={{ padding: '8px', fontWeight: 'bold', border: `2px solid currentColor`, opacity: isEquipped ? 1 : 0.6 }} 
                                        onClick={() => togglePoder(p.id)}
                                    >
                                        {isEquipped ? '★ ATIVADA' : 'Desativada'}
                                    </button>

                                    {/* BOTÃO DISPARAR/PREPARAR MODO */}
                                    <button 
                                        style={{ padding: '8px', fontSize: '0.9em', fontWeight: 'bold', opacity: poderPreparandoId === p.id ? 1 : 0.8 }} 
                                        onClick={() => {
                                            if (poderPreparandoId === p.id) { setPoderPreparandoId(null); } 
                                            else { setPoderPreparandoId(p.id); setOverchargeAtivo(false); }
                                        }}
                                    >
                                        ⚔️ PREPARAR AÇÃO
                                    </button>
                                    
                                    <div style={{ position: 'relative' }} ref={vincularAberto === p.id ? vincularRef : null}>
                                        <button
                                            style={{ padding: '6px', fontSize: '0.8em', width: '100%', opacity: p.armaVinculada ? 1 : 0.6 }}
                                            onClick={() => setVincularAberto(vincularAberto === p.id ? null : p.id)}
                                        >
                                            {p.armaVinculada ? `🔗 ${((minhaFicha?.inventario || []).find(i => String(i.id) === String(p.armaVinculada))?.nome) || 'Arma'}` : 'Vincular a Arma'}
                                        </button>
                                        {vincularAberto === p.id && (
                                            <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 10, background: 'rgba(0,0,0,0.9)', border: '1px solid currentColor', borderRadius: 6, padding: 5, minWidth: 180, marginTop: 4 }}>
                                                <button style={{ width: '100%', padding: '5px 10px', fontSize: '0.85em', margin: '2px 0', background: 'transparent', color: '#fff', border: '1px dotted #ccc' }} onClick={() => vincularArmaAoPoder(p.id, '')}>
                                                    Nenhuma (Livre)
                                                </button>
                                                {armasEquipadas.map(arma => (
                                                    <button key={arma.id} style={{ width: '100%', padding: '5px 10px', fontSize: '0.85em', margin: '2px 0', background: 'transparent', color: String(p.armaVinculada) === String(arma.id) ? '#ffcc00' : '#fff', border: '1px dotted #ccc' }} onClick={() => vincularArmaAoPoder(p.id, String(arma.id))}>
                                                        ⚔️ {arma.nome}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div style={{ display: 'flex', gap: 5 }}>
                                        <button style={{ flex: 1, padding: '4px', fontSize: '0.8em' }} onClick={() => editarPoder(p.id)}>Reescrever</button>
                                        <button style={{ flex: 1, padding: '4px', fontSize: '0.8em', opacity: 0.6 }} onClick={() => deletarPoder(p.id)}>Rasgar</button>
                                    </div>
                                </div>
                            </div>
                            
                            {/* CAIXA DE DISPARO */}
                            {poderPreparandoId === p.id && (
                                <div className="fade-in" style={{ width: '100%', marginTop: '15px', background: 'rgba(0, 0, 0, 0.05)', borderTop: '2px dashed currentColor', paddingTop: '15px' }}>
                                    <h4 style={{ margin: '0 0 10px 0', opacity: 0.9 }}>⚙️ Central de Disparo: {p.nome}</h4>

                                    {pVertenteLower.includes('elemental') ? (
                                        <div style={{ borderLeft: '3px solid currentColor', paddingLeft: '10px', marginBottom: '15px' }}>
                                            <p style={{ margin: '0 0 5px 0', fontWeight: 'bold' }}>🌪️ RESSONÂNCIA ELEMENTAL</p>
                                            <p style={{ fontSize: '0.85em', margin: 0, opacity: 0.8 }}>
                                                A Força da Natureza funde {p.custoPercentual}% das suas energias.<br/>
                                                <span>Mana ({manaUsada})</span> + <span>Aura ({auraUsada})</span> + <span>Chakra ({chakraUsado})</span><br/>
                                                <strong>Poder Bruto Extraído: <span>+{energiaExtraida}</span> de Dano.</strong><br/>
                                                Custo Cobrado na Ficha: <strong>ZERO (Gratuito)</strong>.
                                            </p>

                                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', cursor: 'pointer', background: overchargeAtivo ? 'rgba(0,0,0,0.1)' : 'transparent', padding: '10px', border: '1px dashed currentColor', opacity: overchargeAtivo ? 1 : 0.6 }}>
                                                <input type="checkbox" checked={overchargeAtivo} onChange={e => setOverchargeAtivo(e.target.checked)} style={{ transform: 'scale(1.3)' }} />
                                                <div>
                                                    <div style={{ fontWeight: 'bold' }}>🔥 MODO OVERCHARGE (Queimar Motor)</div>
                                                    <div style={{ fontSize: '0.8em' }}>
                                                        Dobra a energia extraída (<strong>+{energiaOver}</strong> Dano Bruto) para aplicar o seu <strong>Multiplicador Potencial (x{mPotencial})</strong> ao Dano Total Estimado! <br/>
                                                        ⚠️ Mas você <strong>pagará {percBase * 2}%</strong> da sua Mana, Aura e Chakra atuais como custo!
                                                    </div>
                                                </div>
                                            </label>
                                        </div>
                                    ) : pVertenteLower.includes('acumulativo') ? (
                                        <div style={{ borderLeft: '3px solid currentColor', paddingLeft: '10px', marginBottom: '15px', opacity: 0.8 }}>
                                            <p style={{ margin: '0 0 5px 0', fontWeight: 'bold' }}>📈 TÉCNICA ACUMULATIVA</p>
                                            <p style={{ fontSize: '0.85em', margin: 0 }}>
                                                Use os Marcadores de Cena ou a Forja Pós-Combate (Aba Ficha) para processar os ganhos de atributos desta habilidade.<br/>
                                                Custo Padrão: <strong>{p.custoPercentual}% das Energias</strong>. <br/>
                                            </p>
                                        </div>
                                    ) : (
                                        <div style={{ borderLeft: '3px solid currentColor', paddingLeft: '10px', marginBottom: '15px', opacity: 0.8 }}>
                                            <p style={{ margin: '0 0 5px 0', fontWeight: 'bold' }}>🎯 Disparo Padrão</p>
                                            <p style={{ fontSize: '0.85em', margin: 0 }}>
                                                Custo: <strong>{p.custoPercentual}% das Energias</strong>. <br/>
                                                Dano Base dos Dados: {p.dadosQtd}d{p.dadosFaces} + Dano Bruto ({danoBruto})
                                            </p>
                                        </div>
                                    )}

                                    {['habilidade', 'poder'].includes((p.categoria || '').toLowerCase()) && (parseFloat(p.maestriaRequerida) || 0) > 0 && (
                                        (() => {
                                            const maestriaAtual = parseFloat(p.maestria) || 0;
                                            const req = parseFloat(p.maestriaRequerida) || 0;
                                            const suficiente = maestriaAtual >= req;
                                            const cor = suficiente ? '#00ff88' : '#ff8800';
                                            return (
                                                <div style={{ borderLeft: `3px solid ${cor}`, paddingLeft: '10px', marginBottom: '15px', color: cor }}>
                                                    <p style={{ margin: 0, fontSize: '0.85em', fontWeight: 'bold' }}>
                                                        🎓 Maestria: {maestriaAtual}% / {req}% requerida
                                                        {suficiente ? ' — dominada, sem Fadiga extra.' : ' — abaixo do requisito, gera Fadiga extra ao usar.'}
                                                    </p>
                                                </div>
                                            );
                                        })()
                                    )}

                                    <button
                                        style={{ width: '100%', margin: 0, padding: '12px', fontSize: '1.1em', letterSpacing: '1px', fontWeight: 'bold', border: '2px solid currentColor', background: overchargeAtivo ? 'rgba(0,0,0,0.1)' : 'transparent' }}
                                        onClick={() => dispararAtaque(p)}
                                    >
                                        {overchargeAtivo ? '💥 DISPARAR OVERCHARGE FATAL!' : '⚔️ EXECUTAR HABILIDADE'}
                                    </button>
                                </div>
                            )}

                            {/* O editor de formas também foi parar ao Grimório, certifique-se de que ele tem estilos transparentes na classe dele, ou ele adapta-se sozinho */}
                            <FormasEditor
                                formas={p.formas || []}
                                formaAtivaId={p.formaAtivaId || null}
                                onSalvarForma={(forma) => salvarFormaPoder(p.id, forma)}
                                onDeletarForma={(formaId) => deletarFormaPoder(p.id, formaId)}
                                onAtivarForma={(formaId) => ativarFormaPoder(p.id, formaId)}
                            />
                        </div>
            );
    };

    // 🗂️ A aba "🎭 Formas" SEMPRE agrupa por pasta (comportamento original, preservado — quem
    // nunca usou pasta nas Formas continua vendo o bucket único "📁 Sem Pasta"). Habilidades e
    // Poderes, que só ganharam Pasta agora, só entram em modo agrupado se ALGUM item da aba já
    // tiver uma pasta atribuída — senão continuam em lista simples, sem um "📁 Sem Pasta" boiando
    // sozinho pra quem nunca usou pastas nessas duas categorias.
    let grupos = null;
    if (abaAtual === 'forma' || itensFiltrados.some(p => p && (p.pasta || '').trim())) {
        const mapa = {};
        itensFiltrados.forEach(p => {
            if (!p) return;
            const nome = (p.pasta || '').trim() || SEM_PASTA;
            if (!mapa[nome]) mapa[nome] = [];
            mapa[nome].push(p);
        });
        const nomes = Object.keys(mapa).filter(n => n !== SEM_PASTA).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        if (mapa[SEM_PASTA]) nomes.push(SEM_PASTA);
        grupos = nomes.map(nome => ({ nome, itens: mapa[nome] }));
    }

    return (
        <div style={{ marginTop: '20px' }}>
            {itensFiltrados.length === 0 ? (
                <p style={{ opacity: 0.5, fontStyle: 'italic', textAlign: 'center' }}>Nenhum registo deste tipo na sua alma.</p>
            ) : grupos ? (
                grupos.map(({ nome, itens }) => {
                    const fechada = !!pastasFechadas[`${abaAtual}::${nome}`];
                    return (
                        <div key={nome} style={{ marginTop: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px dashed currentColor', paddingBottom: 8 }}>
                                <button onClick={() => toggleFechada(nome)} style={{ flex: 1, textAlign: 'left', padding: '8px 12px', fontWeight: 'bold', fontSize: '1em' }}>
                                    {fechada ? '▶' : '▼'} 📁 {nome} <span style={{ opacity: 0.6, fontWeight: 'normal' }}>({itens.length})</span>
                                </button>
                                {nome !== SEM_PASTA && (
                                    <button onClick={() => renomearOuRemoverPasta(nome)} style={{ padding: '6px 10px', fontSize: '0.8em', opacity: 0.7 }}>
                                        ✎ Renomear/Remover
                                    </button>
                                )}
                            </div>
                            {!fechada && itens.map(p => renderItem(p))}
                        </div>
                    );
                })
            ) : (
                itensFiltrados.map(p => renderItem(p))
            )}
        </div>
    );
}

export function PoderesAuditoria() {
    const ctx = usePoderesForm();
    if (!ctx) return FALLBACK;
    const { relatorioAuditoria } = ctx;

    return (
        <div style={{ marginTop: '30px', borderTop: '2px dashed currentColor', paddingTop: '20px' }}>
            <h3 style={{ marginBottom: 10, opacity: 0.8, fontSize: '1.1em' }}>🔍 Auditoria de Combos Globais (Automático)</h3>
            <div style={{ fontSize: '0.9em', opacity: 0.9 }}>
                {relatorioAuditoria || <span style={{ opacity: 0.6, fontStyle: 'italic' }}>Nenhum efeito passivo ativo computado.</span>}
            </div>
        </div>
    );
}

export function PoderesAreaCentral() {
    return (
        <div style={{ width: '100%' }}>
            <PoderesNavegacaoLivro />
            <PoderesImportadorIA />
            <PoderesFormEditor />
            <PoderesLista />
            <PoderesAuditoria />
        </div>
    );
}