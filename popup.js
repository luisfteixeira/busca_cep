const STORAGE_KEYS = {
  RESULTADO: 'resultado',
  LOCAL_PADRAO: 'localPadrao'
};

let elements;

document.addEventListener('DOMContentLoaded', () => {
  elements = {
    inputCep: document.getElementById('inputCep'),
    inputEstado: document.getElementById('inputEstado'),
    inputCidade: document.getElementById('inputCidade'),
    inputLogradouro: document.getElementById('inputLogradouro'),
    checkExato: document.getElementById('checkExato'),
    checkSalvarLocal: document.getElementById('checkSalvarLocal'),
    statusLocal: document.getElementById('statusLocal'),
    resultado: document.getElementById('resultado'),
    btnBuscarCep: document.getElementById('btnBuscarCep'),
    btnBuscarEndereco: document.getElementById('btnBuscarEndereco'),
    btnLimpar: document.getElementById('btnLimpar'),
    btnLimparLocal: document.getElementById('btnLimparLocal')
  };

  elements.btnBuscarCep.addEventListener('click', buscarCep);
  elements.btnBuscarEndereco.addEventListener('click', buscarEndereco);
  elements.btnLimpar.addEventListener('click', limparResultados);
  elements.btnLimparLocal.addEventListener('click', limparLocalSalvo);

  elements.inputCep.addEventListener('input', onCepInput);
  elements.inputEstado.addEventListener('input', onEstadoInput);
  elements.inputEstado.addEventListener('blur', salvarLocalAoEditar);
  elements.inputCidade.addEventListener('blur', salvarLocalAoEditar);
  elements.checkSalvarLocal.addEventListener('change', onSalvarLocalChange);

  [elements.inputCep, elements.inputEstado, elements.inputCidade, elements.inputLogradouro].forEach((input) => {
    input.addEventListener('keydown', onEnterBuscar);
  });

  carregarDadosSalvos();
});

function onCepInput(event) {
  event.target.value = limparCep(event.target.value);
}

function onEstadoInput(event) {
  event.target.value = event.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2);
}

function onEnterBuscar(event) {
  if (event.key !== 'Enter') {
    return;
  }

  event.preventDefault();

  if (event.target.id === 'inputCep') {
    buscarCep();
    return;
  }

  buscarEndereco();
}

function onSalvarLocalChange() {
  if (elements.checkSalvarLocal.checked) {
    salvarLocalPadrao();
    mostrarStatusLocal('UF e cidade serao salvas automaticamente.');
    return;
  }

  chrome.storage.local.remove(STORAGE_KEYS.LOCAL_PADRAO, () => {
    mostrarStatusLocal('Salvamento automatico desativado.');
  });
}

function salvarLocalAoEditar() {
  if (!elements.checkSalvarLocal.checked) {
    return;
  }

  const estado = elements.inputEstado.value.trim().toUpperCase();
  const cidade = elements.inputCidade.value.trim();

  if (!/^[A-Z]{2}$/.test(estado) || !cidade) {
    return;
  }

  salvarLocalPadrao(estado, cidade);
}

function carregarDadosSalvos() {
  chrome.storage.local.get([STORAGE_KEYS.RESULTADO, STORAGE_KEYS.LOCAL_PADRAO], (data) => {
    if (data[STORAGE_KEYS.RESULTADO]) {
      mostrarResultado(data[STORAGE_KEYS.RESULTADO]);
    }

    const localPadrao = data[STORAGE_KEYS.LOCAL_PADRAO];
    if (localPadrao && localPadrao.estado && localPadrao.cidade) {
      elements.inputEstado.value = localPadrao.estado;
      elements.inputCidade.value = localPadrao.cidade;
      elements.checkSalvarLocal.checked = true;
      mostrarStatusLocal('UF e cidade carregadas automaticamente.');
    }
  });
}

async function buscarCep() {
  const cep = limparCep(elements.inputCep.value);
  elements.inputCep.value = cep;

  if (!/^\d{8}$/.test(cep)) {
    mostrarErro('Digite um CEP valido com 8 numeros.');
    return;
  }

  setLoading(true, 'Buscando CEP...');

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!response.ok) {
      throw new Error('Erro ao buscar o CEP. Tente novamente.');
    }

    const data = await response.json();
    if (data.erro) {
      throw new Error('CEP não encontrado.');
    }

    salvarResultado(data);
    mostrarResultado(data);
  } catch (error) {
    mostrarErro(error.message || 'Não foi possivel buscar o CEP.');
  } finally {
    setLoading(false);
  }
}

async function buscarEndereco() {
  const estado = elements.inputEstado.value.trim().toUpperCase();
  const cidade = elements.inputCidade.value.trim();
  let logradouro = elements.inputLogradouro.value.trim();

  if (!/^[A-Z]{2}$/.test(estado)) {
    mostrarErro('Digite uma UF valida com 2 letras.');
    return;
  }

  if (!cidade || !logradouro) {
    mostrarErro('Preencha cidade e logradouro para buscar o endereço.');
    return;
  }

  if (!elements.checkExato.checked) {
    logradouro = logradouro.replace(/\s+/g, ' ').trim();
  }

  const cidadePath = encodeURIComponent(cidade);
  const logradouroPath = elements.checkExato.checked
    ? encodeURIComponent(logradouro)
    : logradouro
      .split(' ')
      .filter(Boolean)
      .map((parte) => encodeURIComponent(parte))
      .join('+');

  setLoading(true, 'Buscando endereco...');

  try {
    const response = await fetch(`https://viacep.com.br/ws/${estado}/${cidadePath}/${logradouroPath}/json/`);
    if (!response.ok) {
      throw new Error('Erro ao buscar endereço. Verifique os dados e tente novamente.');
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Nenhum endereço encontrado para os dados informados.');
    }

    salvarResultado(data);
    mostrarResultado(data);

    if (elements.checkSalvarLocal.checked) {
      salvarLocalPadrao(estado, cidade);
      mostrarStatusLocal(`Local salvo: ${estado} - ${cidade}.`);
    }
  } catch (error) {
    mostrarErro(error.message || 'Não foi possível buscar o endereço.');
  } finally {
    setLoading(false);
  }
}

function salvarLocalPadrao(estado = '', cidade = '') {
  const estadoFinal = (estado || elements.inputEstado.value || '').trim().toUpperCase();
  const cidadeFinal = (cidade || elements.inputCidade.value || '').trim();

  if (!estadoFinal || !cidadeFinal) {
    return;
  }

  chrome.storage.local.set({
    [STORAGE_KEYS.LOCAL_PADRAO]: {
      estado: estadoFinal,
      cidade: cidadeFinal
    }
  });
}

function limparLocalSalvo() {
  chrome.storage.local.remove(STORAGE_KEYS.LOCAL_PADRAO, () => {
    elements.inputEstado.value = '';
    elements.inputCidade.value = '';
    elements.checkSalvarLocal.checked = false;
    mostrarStatusLocal('UF e cidade salvas foram removidas.');
  });
}

function mostrarResultado(data) {
  if (!data || (Array.isArray(data) && data.length === 0)) {
    elements.resultado.innerHTML = '<div class="erro-msg">Nenhum resultado encontrado.</div>';
    return;
  }

  let resultadoHTML = '';

  if (Array.isArray(data)) {
    resultadoHTML += `<p class="result-count">${data.length} resultado(s) encontrado(s).</p>`;
    data.forEach((item) => {
      resultadoHTML += formatarResultado(item);
    });
  } else {
    resultadoHTML = formatarResultado(data);
  }

  elements.resultado.innerHTML = resultadoHTML;
}

function formatarResultado(item) {
  return `
    <div class="resultado-item">
      <div><strong>CEP:</strong> ${safeValue(item.cep)}</div>
      <div><strong>Logradouro:</strong> ${safeValue(item.logradouro)}</div>
      <div><strong>Bairro:</strong> ${safeValue(item.bairro)}</div>
      <div><strong>Cidade:</strong> ${safeValue(item.localidade)}</div>
      <div><strong>UF:</strong> ${safeValue(item.uf)}</div>
      <div><strong>Complemento:</strong> ${safeValue(item.complemento)}</div>
    </div>
    <hr>
  `;
}

function mostrarErro(message) {
  elements.resultado.innerHTML = `<div class="erro-msg">${escapeHtml(message)}</div>`;
}

function salvarResultado(resultado) {
  chrome.storage.local.set({ [STORAGE_KEYS.RESULTADO]: resultado }, () => {
    if (chrome.runtime.lastError) {
      console.error('Erro ao salvar resultado:', chrome.runtime.lastError);
    }
  });
}

function limparResultados() {
  chrome.storage.local.remove(STORAGE_KEYS.RESULTADO, () => {
    elements.resultado.innerHTML = '';
  });
}

function limparCep(value) {
  return (value || '').replace(/\D/g, '').slice(0, 8);
}

function setLoading(isLoading, message = '') {
  elements.btnBuscarCep.disabled = isLoading;
  elements.btnBuscarEndereco.disabled = isLoading;

  if (isLoading) {
    elements.resultado.innerHTML = `<div class="loading-msg">${escapeHtml(message)}</div>`;
  }
}

function mostrarStatusLocal(message) {
  elements.statusLocal.textContent = message;
}

function safeValue(value) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return escapeHtml(String(value));
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
