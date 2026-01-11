import React, { useState, useEffect, useRef } from 'react';
import { Send, LogOut, Users, MessageCircle } from 'lucide-react';

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

  // Auto-scroll vers le dernier message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [selectedConv]);

  // Charger les données de l'utilisateur
  useEffect(() => {
    const loadUserData = async () => {
      if (!currentUser) return;
      
      try {
        const userKey = `user:${currentUser}`;
        const result = await window.storage.get(userKey);
        if (result) {
          const userData = JSON.parse(result.value);
          setConversations(userData.conversations || []);
        }
      } catch (err) {
        console.log('Pas de données utilisateur existantes');
      }

      // Charger la liste des utilisateurs
      try {
        const usersResult = await window.storage.get('all_users', true);
        if (usersResult) {
          setAllUsers(JSON.parse(usersResult.value));
        }
      } catch (err) {
        console.log('Pas d\'utilisateurs');
      }
    };

    loadUserData();
  }, [currentUser]);

  // Polling pour les nouveaux messages
  useEffect(() => {
    if (!currentUser) return;

    const checkNewMessages = async () => {
      try {
        const userKey = `user:${currentUser}`;
        const result = await window.storage.get(userKey);
        if (result) {
          const userData = JSON.parse(result.value);
          setConversations(userData.conversations || []);
        }
      } catch (err) {
        console.log('Erreur lors de la vérification des messages');
      }
    };

    // Vérifier les nouveaux messages toutes les 2 secondes
    pollInterval.current = setInterval(checkNewMessages, 2000);

    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
      }
    };
  }, [currentUser]);

  const saveUserData = async (userData) => {
    const userKey = `user:${currentUser}`;
    await window.storage.set(userKey, JSON.stringify(userData));
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
        // Inscription
        try {
          const existing = await window.storage.get(authKey, true);
          if (existing) {
            setError('Cet utilisateur existe déjà');
            return;
          }
        } catch (err) {
          // L'utilisateur n'existe pas, on peut continuer
        }

        await window.storage.set(authKey, password, true);
        
        // Ajouter à la liste des utilisateurs
        let users = [];
        try {
          const usersResult = await window.storage.get('all_users', true);
          if (usersResult) {
            users = JSON.parse(usersResult.value);
          }
        } catch (err) {
          // Pas d'utilisateurs encore
        }
        
        if (!users.includes(username)) {
          users.push(username);
          await window.storage.set('all_users', JSON.stringify(users), true);
        }

        setCurrentUser(username);
        setUsername('');
        setPassword('');
      } else {
        // Connexion
        const result = await window.storage.get(authKey, true);
        if (!result || result.value !== password) {
          setError('Identifiants incorrects');
          return;
        }
        setCurrentUser(username);
        setUsername('');
        setPassword('');
      }
    } catch (err) {
      setError('Erreur lors de l\'authentification');
    }
  };

  const startNewChat = async () => {
    if (!newChatUser) return;
    
    const existingConv = conversations.find(c => c.with === newChatUser);
    if (existingConv) {
      setSelectedConv(existingConv);
      setNewChatUser('');
      return;
    }

    const newConv = {
      id: `${currentUser}_${newChatUser}_${Date.now()}`,
      with: newChatUser,
      messages: []
    };

    const updatedConvs = [...conversations, newConv];
    setConversations(updatedConvs);
    await saveUserData({ conversations: updatedConvs });
    setSelectedConv(newConv);
    setNewChatUser('');
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConv) return;

    const message = {
      id: Date.now(),
      from: currentUser,
      text: newMessage,
      timestamp: new Date().toISOString()
    };

    // Mettre à jour la conversation de l'expéditeur
    const updatedConvs = conversations.map(c => 
      c.id === selectedConv.id 
        ? { ...c, messages: [...c.messages, message] }
        : c
    );
    setConversations(updatedConvs);
    await saveUserData({ conversations: updatedConvs });

    // Mettre à jour la conversation du destinataire
    const recipientKey = `user:${selectedConv.with}`;
    try {
      let recipientData = { conversations: [] };
      try {
        const result = await window.storage.get(recipientKey);
        if (result) {
          recipientData = JSON.parse(result.value);
        }
      } catch (err) {
        // Pas de données pour ce destinataire
      }

      let recipientConv = recipientData.conversations.find(c => c.with === currentUser);
      if (!recipientConv) {
        recipientConv = {
          id: `${selectedConv.with}_${currentUser}_${Date.now()}`,
          with: currentUser,
          messages: []
        };
        recipientData.conversations.push(recipientConv);
      }

      recipientConv.messages.push(message);
      await window.storage.set(recipientKey, JSON.stringify(recipientData));
    } catch (err) {
      console.log('Erreur lors de l\'envoi au destinataire');
    }

    setNewMessage('');
    setSelectedConv(updatedConvs.find(c => c.id === selectedConv.id));
  };

  const logout = () => {
    setCurrentUser(null);
    setConversations([]);
    setSelectedConv(null);
  };

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
            <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <input
              type="text"
              placeholder="Nom d'utilisateur"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
            <input
              type="password"
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAuth()}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
            <button
              onClick={handleAuth}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
            >
              {isSignup ? 'S\'inscrire' : 'Se connecter'}
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
            <button onClick={logout} className="hover:bg-indigo-700 p-2 rounded-lg">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Nom d'utilisateur..."
              value={newChatUser}
              onChange={(e) => setNewChatUser(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && startNewChat()}
              className="flex-1 px-3 py-2 rounded-lg text-gray-800 outline-none"
            />
            <button
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
                className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                  selectedConv?.id === conv.id ? 'bg-indigo-50' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-semibold">
                    {conv.with[0].toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800">{conv.with}</h3>
                    <p className="text-sm text-gray-500 truncate">
                      {conv.messages.length > 0 
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
                  {selectedConv.with[0].toUpperCase()}
                </div>
                <h2 className="text-lg font-semibold text-gray-800">{selectedConv.with}</h2>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {selectedConv.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.from === currentUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-md px-4 py-2 rounded-2xl ${
                      msg.from === currentUser
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    <p>{msg.text}</p>
                    <p className={`text-xs mt-1 ${msg.from === currentUser ? 'text-indigo-200' : 'text-gray-500'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="bg-white border-t border-gray-200 p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Écrivez votre message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
                <button
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
