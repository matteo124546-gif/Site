import React, { useState, useEffect, useRef } from 'react';
import { Send, LogOut, Users, MessageCircle } from 'lucide-react';

/**
 * PrivateChatApp
 * - Composant React autonome pour un petit chat local utilisant `window.storage`.
 * - Attentions :
 *   * Ce composant suppose l'existence d'une API globale `window.storage` avec
 *     des méthodes `get(key, raw?)` et `set(key, value, raw?)`.
 *   * Adaptez les appels de stockage si votre API diffère.
 */
export default function PrivateChatApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [newChatUser, setNewChatUser] = useState('');
  const [error, setError] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const messagesEndRef = useRef(null);
  const pollInterval = useRef(null);

  // Helpers stockage : lecture/écriture robustes
  const safeGetRaw = async (key, rawFlag = false) => {
    try {
      const result = await window.storage.get(key, rawFlag);
      if (!result) return null;
      // `window.storage.get` peut retourner { value } ou une primitive selon impl.
      const value = typeof result === 'object' && 'value' in result ? result.value : result;
      return value;
    } catch (err) {
      return null;
    }
  };

  const safeSet = async (key, value, rawFlag = false) => {
    try {
      await window.storage.set(key, value, rawFlag);
    } catch (err) {
      console.error('Erreur storage.set', err);
    }
  };

  const safeJSONParse = (str, fallback = null) => {
    try {
      return typeof str === 'string' ? JSON.parse(str) : str;
    } catch {
      return fallback;
    }
  };

  // Auto-scroll vers le dernier message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [selectedConv, conversations]);

  // Charger les données de l'utilisateur (conversations + liste d'utilisateurs)
  useEffect(() => {
    const loadUserData = async () => {
      if (!currentUser) return;

      try {
        const userKey = `user:${currentUser}`;
        const result = await safeGetRaw(userKey);
        if (result) {
          const userData = safeJSONParse(result, {});
          setConversations(userData.conversations || []);
        } else {
          setConversations([]);
        }
      } catch (err) {
        console.log('Pas de données utilisateur existantes', err);
        setConversations([]);
      }

      // Charger la liste des utilisateurs
      try {
        const usersResult = await safeGetRaw('all_users', true);
        if (usersResult) {
          const parsed = safeJSONParse(usersResult, []);
          setAllUsers(parsed);
        } else {
          setAllUsers([]);
        }
      } catch (err) {
        console.log("Pas d'utilisateurs", err);
        setAllUsers([]);
      }
    };

    loadUserData();
  }, [currentUser]);

  // Polling pour nouveaux messages / synchronisation
  useEffect(() => {
    if (!currentUser) return;

    const checkNewMessages = async () => {
      try {
        const userKey = `user:${currentUser}`;
        const result = await safeGetRaw(userKey);
        if (result) {
          const userData = safeJSONParse(result, {});
          setConversations(userData.conversations || []);
        }
      } catch (err) {
        console.log('Erreur lors de la vérification des messages', err);
      }
    };

    // Vérifier toutes les 2000ms
    pollInterval.current = setInterval(checkNewMessages, 2000);

    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [currentUser]);

  const saveUserData = async (data) => {
    if (!currentUser) return;
    const userKey = `user:${currentUser}`;
    // Sauvegarder en JSON stringifié pour compatibilité
    await safeSet(userKey, JSON.stringify(data));
  };

  const handleAuth = async () => {
    setError('');
    if (!username || !password) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    const authKey = `auth:${username}`;

    try {
      if (isSignup) {
        // Inscription : vérifier si existe déjà
        try {
          const existing = await safeGetRaw(authKey, true);
          if (existing) {
            setError('Cet utilisateur existe déjà');
            return;
          }
        } catch {
          // continuer si get échoue
        }

        // Enregistrer mot de passe (attention : stockage non chiffré dans cet exemple)
        await safeSet(authKey, password, true);

        // Ajouter à la liste des utilisateurs
        let users = [];
        try {
          const usersResult = await safeGetRaw('all_users', true);
          users = usersResult ? safeJSONParse(usersResult, []) : [];
        } catch {
          users = [];
        }

        if (!users.includes(username)) {
          users.push(username);
          await safeSet('all_users', JSON.stringify(users), true);
        }

        setCurrentUser(username);
        setUsername('');
        setPassword('');
      } else {
        // Connexion
        const result = await safeGetRaw(authKey, true);
        if (!result || result !== password) {
          setError('Identifiants incorrects');
          return;
        }
        setCurrentUser(username);
        setUsername('');
        setPassword('');
      }
    } catch (err) {
      console.error('Erreur auth', err);
      setError("Erreur lors de l'authentification");
    }
  };

  const startNewChat = async () => {
    if (!newChatUser.trim() || !currentUser) return;

    if (newChatUser === currentUser) {
      setError("Vous ne pouvez pas démarrer une conversation avec vous-même");
      return;
    }

    const existingConv = conversations.find((c) => c.with === newChatUser);
    if (existingConv) {
      setSelectedConv(existingConv);
      setNewChatUser('');
      return;
    }

    const newConv = {
      id: `${currentUser}_${newChatUser}_${Date.now()}`,
      with: newChatUser,
      messages: [],
    };

    const updatedConvs = [...conversations, newConv];
    setConversations(updatedConvs);
    await saveUserData({ conversations: updatedConvs });
    setSelectedConv(newConv);
    setNewChatUser('');
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConv || !currentUser) return;

    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      from: currentUser,
      text: newMessage,
      timestamp: new Date().toISOString(),
    };

    // Mettre à jour la conversation de l'expéditeur
    const updatedConvs = conversations.map((c) =>
      c.id === selectedConv.id ? { ...c, messages: [...c.messages, message] } : c
    );
    setConversations(updatedConvs);
    await saveUserData({ conversations: updatedConvs });

    // Mettre à jour la conversation du destinataire
    const recipientKey = `user:${selectedConv.with}`;
    try {
      let recipientData = { conversations: [] };
      try {
        const result = await safeGetRaw(recipientKey);
        if (result) recipientData = safeJSONParse(result, { conversations: [] });
      } catch {
        // pas de données pour le destinataire
      }

      let recipientConv = recipientData.conversations.find((c) => c.with === currentUser);
      if (!recipientConv) {
        recipientConv = {
          id: `${selectedConv.with}_${currentUser}_${Date.now()}`,
          with: currentUser,
          messages: [],
        };
        recipientData.conversations.push(recipientConv);
      }

      recipientConv.messages.push(message);
      await safeSet(recipientKey, JSON.stringify(recipientData));
    } catch (err) {
      console.log("Erreur lors de l'envoi au destinataire", err);
    }

    setNewMessage('');
    setSelectedConv(updatedConvs.find((c) => c.id === selectedConv.id));
  };

  const logout = () => {
    setCurrentUser(null);
    setConversations([]);
    setSelectedConv(null);
  };

  // UI
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <MessageCircle className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-800">Chat Privé</h1>
            <p className="text-gray-600 mt-2">Messagerie sécurisée instantanée</p>
          </div>

          {error && (
            <div role="alert" className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <input
              aria-label="Nom d'utilisateur"
              type="text"
              placeholder="Nom d'utilisateur"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <input
              aria-label="Mot de passe"
              type="password"
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <button
              onClick={handleAuth}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
            >
              {isSignup ? "S'inscrire" : 'Se connecter'}
            </button>
            <button
              onClick={() => {
                setIsSignup(!isSignup);
                setError('');
              }}
              className="w-full text-indigo-600 hover:text-indigo-700 font-medium"
            >
              {isSignup ? 'Déjà un compte ? Se connecter' : 'Créer un compte'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200 bg-indigo-600 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-6 h-6" />
              <h2 className="text-lg font-semibold">{currentUser}</h2>
            </div>
            <button
              aria-label="Se déconnecter"
              onClick={logout}
              className="hover:bg-indigo-700 p-2 rounded-lg"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              aria-label="Nouvelle conversation"
              type="text"
              placeholder="Nom d'utilisateur..."
              value={newChatUser}
              onChange={(e) => setNewChatUser(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && startNewChat()}
              className="flex-1 px-3 py-2 rounded-lg text-gray-800 outline-none"
            />
            <button
              aria-label="Démarrer une conversation"
              onClick={startNewChat}
              className="bg-indigo-700 hover:bg-indigo-800 px-4 py-2 rounded-lg font-medium"
            >
              +
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Aucune conversation</p>
              <p className="text-sm">Commencez à discuter !</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => setSelectedConv(conv)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setSelectedConv(conv)}
                className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                  selectedConv?.id === conv.id ? 'bg-indigo-50' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-semibold">
                    {conv.with?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800">{conv.with}</h3>
                    <p className="text-sm text-gray-500 truncate">
                      {conv.messages?.length > 0
                        ? conv.messages[conv.messages.length - 1].text
                        : 'Nouvelle conversation'}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Zone de chat */}
      <div className="flex-1 flex flex-col">
        {selectedConv ? (
          <>
            <div className="bg-white border-b border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-semibold">
                  {selectedConv.with?.[0]?.toUpperCase() || '?'}
                </div>
                <h2 className="text-lg font-semibold text-gray-800">{selectedConv.with}</h2>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {selectedConv.messages?.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.from === currentUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-md px-4 py-2 rounded-2xl ${
                      msg.from === currentUser ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    <p>{msg.text}</p>
                    <p
                      className={`text-xs mt-1 ${
                        msg.from === currentUser ? 'text-indigo-200' : 'text-gray-500'
                      }`}
                    >
                      {new Date(msg.timestamp).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))}

              <div ref={messagesEndRef} />
            </div>

            <div className="bg-white border-t border-gray-200 p-4">
              <div className="flex gap-2">
                <input
                  aria-label="Message"
                  type="text"
                  placeholder="Écrivez votre message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <button
                  aria-label="Envoyer"
                  onClick={sendMessage}
                  className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <MessageCircle className="w-24 h-24 mx-auto mb-4 opacity-50" />
              <p className="text-xl">Sélectionnez une conversation</p>
              <p className="text-sm">ou commencez-en une nouvelle</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
