// Copyright(c) ZenML GmbH 2024. All Rights Reserved.
// Licensed under the Apache License, Version 2.0(the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at:

//      http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
// or implied.See the License for the specific language governing
// permissions and limitations under the License.
(function () {
  let currentAssistantMessage = '';
  const vscode = acquireVsCodeApi();

  // Function to save the current state
  function saveState() {
    const provider = document.querySelector('#provider-dropdown').value;
    const model = document.querySelector('#model-dropdown').value;

    // All visible context
    const visibleBoxes = Array.from(
      document.querySelectorAll('#tree-view input[type="checkbox"]')
    ).map(checkbox => checkbox.value);

    // Context that is selected and not visible
    // This should only be selected pipeline runs on different pages
    // Hidden context will always start as active context
    let state = JSON.parse(localStorage.getItem('selectedContexts')) || [];
    const hiddenBoxes = [...new Set(state)].filter(
      selectedContext => !visibleBoxes.includes(selectedContext)
    );

    // Context that is selected and visible
    const activeBoxes = Array.from(
      document.querySelectorAll('#tree-view input[type="checkbox"]:checked')
    ).map(checkbox => checkbox.value);

    // If there are any hidden saved boxes
    state = activeBoxes.concat(hiddenBoxes);

    localStorage.setItem('selectedProvider', provider);
    localStorage.setItem('selectedModel', model);
    localStorage.setItem('selectedContexts', JSON.stringify(state));
  }

  // Function to restore the saved state
  function restoreState() {
    const selectedProvider = localStorage.getItem('selectedProvider');
    const selectedModel = localStorage.getItem('selectedModel');
    const selectedContexts = JSON.parse(localStorage.getItem('selectedContexts')) || [];

    if (selectedProvider) {
      document.querySelector('#provider-dropdown').value = selectedProvider;
    }
    if (selectedModel) {
      document.querySelector('#model-dropdown').value = selectedModel;
    }

    const allCheckboxes = document.querySelectorAll('#tree-view input[type="checkbox"]');

    selectedContexts.forEach(savedValue => {
      allCheckboxes.forEach(checkbox => {
        if (checkbox.value === savedValue) {
          checkbox.checked = true;
        }
      });
    });

    const pipelineRunsDropdown = document.querySelectorAll('div.tree-item-children')[0];
    let isContextPipelineRunsDisplayed =
      localStorage.getItem('displayContextPipelineRuns') === 'true';

    if (isContextPipelineRunsDisplayed === true) {
      pipelineRunsDropdown.classList.add('open');
    } else {
      pipelineRunsDropdown.classList.remove('open');
    }

    vscode.postMessage({ command: 'updateProvider', provider: selectedProvider });
  }

  // Checkbox behavior for children checkboxes under pipeline runs
  const pipelineRunsBox = document.querySelector('input[type="checkbox"][value="pipelineContext"]');
  pipelineRunsBox.addEventListener('click', toggleTreeItemBoxes);

  function toggleTreeItemBoxes() {
    const pipelineRunsBox = document.querySelector(
      'input[type="checkbox"][value="pipelineContext"]'
    );

    const pipelineRunBoxes = document.querySelectorAll(
      'input[type="checkbox"][value*="Pipeline Run:"]'
    );

    // Condition: If the main checkbox is clicked, all children checkboxes should be checked.
    if (pipelineRunsBox.checked) {
      pipelineRunBoxes.forEach(checkbox => (checkbox.checked = true));
      console.log('checked boxes: ', pipelineRunBoxes);
    } else {
      pipelineRunBoxes.forEach(checkbox => (checkbox.checked = false));
    }

    // Condition: If any of the children checkboxes are unchecked, then the main checkbox should be checked.
    function updateMainCheckbox() {
      const anyUnchecked = Array.from(pipelineRunBoxes).some(checkbox => !checkbox.checked);
      pipelineRunsBox.checked = !anyUnchecked;
    }

    pipelineRunBoxes.forEach(checkbox => {
      checkbox.addEventListener('change', updateMainCheckbox);
    });
  }

  // Sends a message to the LLM
  function sendMessage(event) {
    event.preventDefault();
    if (isInputDisabled) {
      return;
    }

    const message = messageInput.value.trim();
    const selectedProvider = localStorage.getItem('selectedProvider');
    const selectedModel = localStorage.getItem('selectedModel');
    const context = JSON.parse(localStorage.getItem('selectedContexts')) || [];

    if (message) {
      vscode.postMessage({
        command: 'sendMessage',
        text: message,
        context: context,
        provider: selectedProvider,
        model: selectedModel,
      });

      event.target.reset();
      saveState(); // Save state before refresh
    }
  }

  window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
      case 'updateChatLog': {
        document.getElementById('chatMessages').innerHTML = message.chatLogHtml;
        break;
      }
    }
  });

  document.getElementById('chatForm').addEventListener('submit', sendMessage);

  // Clears chat log
  function clearChatLog() {
    vscode.postMessage({
      command: 'clearChat',
    });
    saveState(); // Save state before refresh
  }

  document.getElementById('clearChat').addEventListener('click', clearChatLog);

  // Adds the message to the UI
  function appendToChat(text, role) {
    const chatMessages = document.getElementById('chatMessages');
    let messageDiv;

    if (role === 'assistant') {
      messageDiv =
        chatMessages.querySelector('div[data-role="assistant"]:last-child') ||
        chatMessages.lastElementChild;

      if (!messageDiv || messageDiv.getAttribute('data-role') !== 'assistant') {
        messageDiv = document.createElement('div');
        messageDiv.className = 'p-4 assistant';
        messageDiv.setAttribute('data-role', 'assistant');
        messageDiv.innerHTML = `
          <p class="font-semibold text-zenml">ZenML Assistant</p>
        `;

        chatMessages.appendChild(messageDiv, chatMessages.firstChild);
        currentAssistantMessage = '';
      }

      currentAssistantMessage += text;

      const html = marked.parse(currentAssistantMessage);
      const sanitizeHtml = DOMPurify.sanitize(html);

      requestAnimationFrame(() => {
        messageDiv.innerHTML = `
          <p class="font-semibold text-zenml">ZenML Assistant</p>
          ${sanitizeHtml}
        `;
        chatMessages.scrollTop = chatMessages.scrollHeight;
      });
    }
  }

  let isInputDisabled = false;

  function disableInput() {
    isInputDisabled = true;
    document.getElementById('sendMessage').disabled = true;
  }

  function enableInput() {
    isInputDisabled = false;
    document.getElementById('sendMessage').disabled = false;
  }

  const providerDropdown = document.getElementById('provider-dropdown');
  const modelDropdown = document.getElementById('model-dropdown');

  providerDropdown.addEventListener('change', event => {
    const selectedProvider = event.target.value;
    vscode.postMessage({ command: 'updateProvider', provider: selectedProvider });
  });

  modelDropdown.addEventListener('change', event => {
    const selectedModel = event.target.value;
    vscode.postMessage({ command: 'updateModel', model: selectedModel });
  });

  window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
      case 'updateChatLog': {
        const sanitizeHtml = DOMPurify.sanitize(message.chatLogHtml);
        document.getElementById('chatMessages').innerHTML = sanitizeHtml;
        addCopyButtonsToAssistantMessages(); // For the potential view refresh command
        break;
      }
      case 'receiveMessage': {
        if (message.text === 'disableInput') {
          disableInput();
        } else if (message.text === 'enableInput') {
          enableInput();
          addCopyButtonToLastAssistantMessage();
        } else {
          appendToChat(message.text, 'assistant');
        }
        break;
      }
      case 'showInfo': {
        vscode.window.showInformationMessage({
          command: 'showInfoToExtension',
          text: message.text,
        });
        break;
      }
      case 'updateModelList': {
        updateModelDropdown(message.models);
        break;
      }
      case 'updateModel': {
        localStorage.setItem('selectedModel', message.text);
        restoreState();
        break;
      }
      case 'hideLoader': {
        hideLoader();
        break;
      }
    }
  });

  function hideLoader() {
    loader.classList.remove('loader');
  }

  function updateModelDropdown(models) {
    modelDropdown.innerHTML = models
      .map(model => `<option value="${model}">${model}</option>`)
      .join('');
  }

  function addCopyButtonsToAssistantMessages() {
    const assistantMessages = document.querySelectorAll('.assistant');
    assistantMessages.forEach(addCopyButtonToMessage);
  }

  function addCopyButtonToLastAssistantMessage() {
    const lastAssistantMessage = document.querySelector('.assistant:last-child');
    if (lastAssistantMessage) {
      addCopyButtonToMessage(lastAssistantMessage);
    }
  }

  function addCopyButtonToMessage(messageDiv) {
    if (!messageDiv.querySelector('.copy-button')) {
      const copyButton = document.createElement('button');
      copyButton.className = 'copy-button';
      copyButton.textContent = 'Copy';
      copyButton.addEventListener('click', () => {
        // Find all text content within the message div, excluding the "ZenML Assistant" header and the copy button
        const content = Array.from(messageDiv.childNodes)
          .filter(
            node =>
              node.nodeType === Node.TEXT_NODE ||
              (node.nodeType === Node.ELEMENT_NODE &&
                !node.classList.contains('font-semibold') &&
                !node.classList.contains('copy-button'))
          )
          .map(node => node.textContent)
          .join('')
          .trim();

        if (content) {
          navigator.clipboard.writeText(content).then(() => {
            vscode.postMessage({ command: 'showInfo', text: 'Message copied to clipboard' });
          });
        } else {
          vscode.postMessage({ command: 'showInfo', text: 'No content to copy' });
        }
      });
      messageDiv.appendChild(copyButton);
    }
  }

  // Add event listeners to save state when dropdowns or checkboxes change
  document.querySelector('#provider-dropdown').addEventListener('change', saveState);
  document.querySelector('#model-dropdown').addEventListener('change', saveState);
  document.querySelectorAll('#tree-view input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', saveState);
  });

  function sendSampleMessage() {
    const provider = document.querySelector('#provider-dropdown').value;
    const model = document.querySelector('#model-dropdown').value;
    let context = [model];
    let buttonValue = this.value;
    let message;

    switch (buttonValue) {
      case 'aboutChat': {
        message = 'What can this chat do?';
        break;
      }
      case 'summarizeStats': {
        message = 'Generate a summary of my stats.';
        context.push('serverContext');
        context.push('environmentContext');
        context.push('pipelineContext');
        context.push('stackContext');
        context.push('stackComponentsContext');
        break;
      }
      case 'summarizeLogs': {
        message = 'Generate a summary of my logs.';
        context.push('logsContext');
        break;
      }
      default: {
        break;
      }
    }

    if (message) {
      vscode.postMessage({
        command: 'sendMessage',
        text: message,
        context: context,
        provider: provider,
        model: model,
      });

      saveState();
    }
  }

  document.querySelectorAll('.sampleQuestions').forEach(button => {
    button.addEventListener('click', sendSampleMessage);
  });

  const prevPageButton = document.getElementById('prevPage');
  const nextPageButton = document.getElementById('nextPage');

  if (prevPageButton) {
    prevPageButton.addEventListener('click', () => {
      vscode.postMessage({ command: 'prevPage' });
    });
  }

  if (nextPageButton) {
    nextPageButton.addEventListener('click', () => {
      vscode.postMessage({ command: 'nextPage' });
    });
  }

  document.addEventListener('DOMContentLoaded', event => {
    const contextButton = document.getElementById('contextButton');
    const optionsDropdown = document.getElementById('optionsDropdown');

    let isContextDisplayed = localStorage.getItem('displayContext') === 'true';
    if (isContextDisplayed) {
      optionsDropdown.classList.remove('hidden');
    } else {
      optionsDropdown.classList.add('hidden');
    }

    contextButton.addEventListener('click', event => {
      event.stopPropagation();
      optionsDropdown.classList.toggle('hidden');
      isContextDisplayed = !isContextDisplayed;
      localStorage.setItem('displayContext', String(isContextDisplayed));
    });

    document.addEventListener('click', event => {
      if (!contextButton.contains(event.target) && !optionsDropdown.contains(event.target)) {
        optionsDropdown.classList.add('hidden');
        isContextDisplayed = false;
        localStorage.setItem('displayContext', String(isContextDisplayed));
      }
    });

    const pipelineRunsDropdown = document.querySelectorAll('div.tree-item-children')[0];
    let isContextPipelineRunsDisplayed =
      localStorage.getItem('displayContextPipelineRuns') === 'true';
    if (isContextPipelineRunsDisplayed === true && isContextDisplayed === true) {
      pipelineRunsDropdown.classList.add('open');
    } else {
      pipelineRunsDropdown.classList.remove('open');
    }

    const treeItemsWithChildren = Array.from(
      document.querySelectorAll('div.tree-item-wrapper')
    ).filter(
      treeItemsWithChildren =>
        treeItemsWithChildren.querySelector('div.tree-item-children') !== null
    );

    treeItemsWithChildren.forEach(wrapper => {
      wrapper.querySelector('div.tree-item-content').addEventListener('click', function (event) {
        const checkboxEl = this.querySelector('input[type="checkbox"]');
        const childrenEl = this.parentNode.querySelector('div.tree-item-children');
        const chevronEl = this.querySelector('span.tree-item-icon');
        const prevPageButton = document.getElementById('prevPage');
        const nextPageButton = document.getElementById('nextPage');

        if (
          event.target !== checkboxEl &&
          event.target !== nextPageButton &&
          event.target !== prevPageButton
        ) {
          event.stopPropagation();
          childrenEl.classList.toggle('open');
          isContextPipelineRunsDisplayed = !isContextPipelineRunsDisplayed;
          localStorage.setItem(
            'displayContextPipelineRuns',
            String(isContextPipelineRunsDisplayed)
          );

          if (childrenEl.classList.contains('open')) {
            chevronEl.innerHTML =
              '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#808080" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
          } else {
            chevronEl.innerHTML =
              '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#808080" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
          }
        }
      });
    });

    const textarea = document.getElementById('messageInput');
    const loader = document.getElementById('loader');
    isInputDisabled = false;

    function showLoader() {
      loader.classList.add('loader');
    }

    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          // Insert a new line when Shift+Enter is pressed
          e.preventDefault();
          textarea.value += '\n';
          textarea.scrollTop = textarea.scrollHeight;
        } else {
          e.preventDefault();
          if (!isInputDisabled) {
            const form = document.getElementById('chatForm');
            const event = new CustomEvent('submit', {
              bubbles: true,
              cancelable: true,
            });
            form.dispatchEvent(event);
            showLoader();
          }
        }
      }
    });

    // Restore dropdown state
    restoreState();
  });
})();
