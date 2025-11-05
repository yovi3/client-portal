"use client";

import React, { useState, useEffect, useRef } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Paperclip, Send } from "lucide-react";

export default function Messages() {
  // --- STATE VARIABLES ---
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  
  // --- NEW STATE FOR LOADING/ERRORS ---
  const [isLoading, setIsLoading] = useState(true); // Start in loading state
  const [error, setError] = useState(null); // To store any errors

  const messagesEndRef = useRef(null);
  const webSocketRef = useRef(null);

  // TODO: You (Lawyer) are sending, so you need your ID
  const YOUR_LAWYER_ID = 1; // Get this from your auth context

  // --- EFFECT 1: Fetch Conversations (Cases) ---
  useEffect(() => {
    // We use an async function inside useEffect to use await
    const fetchConversations = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const res = await fetch(`http://0.0.0.0:8002/lawyers/${YOUR_LAWYER_ID}/cases`);

        // Check if the HTTP response is 2xx
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ detail: "Network error or non-JSON response" }));
          throw new Error(errorData.detail || `HTTP error! Status: ${res.status}`);
        }

        const casesWithClients = await res.json();

        // Check if the data is actually an array
        if (!Array.isArray(casesWithClients)) {
          console.error("API did not return an array:", casesWithClients);
          throw new Error("Invalid data format received from server.");
        }

        // Format the data for our state
        const formattedConvos = casesWithClients.map(c => ({
           id: c.id,
           participantName: c?.title || "Unknown Client",
           lastMessage: "...", // You may need another endpoint to get this
           lastMessageTime: "...", // This could come from the last message
           unreadCount: c.unread_messages,
           _caseData: c // Store original data just in case
        }));
        
        setConversations(formattedConvos);

      } catch (err) {
        console.error("Failed to fetch conversations:", err);
        setError(err.message); // Store the error message to display
      } finally {
        setIsLoading(false); // Stop loading
      }
    };

    fetchConversations();

  }, []); // Empty dependency array means this runs once on mount

  
  // --- EFFECT 2: Fetch Messages & Connect WebSocket ---
  useEffect(() => {
    // This hook runs when 'selectedConversation' changes
    if (selectedConversation) {
      // 1. Fetch message history
      fetch(`http://0.0.0.0:8002/cases/${selectedConversation.id}/messages`)
        .then((res) => {
          if (!res.ok) throw new Error('Failed to fetch messages');
          return res.json();
        })
        .then((data) => {
           if (Array.isArray(data)) {
             setMessages(data.map(msg => ({ ...msg, id: msg.id })));
           }
           scrollToBottom();
        })
        .catch(err => console.error("Message fetch error:", err));

      // 2. Connect to WebSocket
      if (webSocketRef.current) {
        webSocketRef.current.close();
      }

      const ws = new WebSocket(`ws://0.0.0.0:8002/ws/${selectedConversation.id}`);
      webSocketRef.current = ws;

      ws.onopen = () => console.log("WebSocket connected");
      ws.onclose = () => console.log("WebSocket disconnected");

      ws.onmessage = (event) => {
        try {
          const newMessage = JSON.parse(event.data);
          setMessages((prevMessages) => [...prevMessages, { ...newMessage, id: newMessage.id }]);
        } catch (e) {
          console.error("Failed to parse ws message", e);
        }
      };

      // Cleanup on unmount or when conversation changes
      return () => {
        if (webSocketRef.current) {
          webSocketRef.current.close();
        }
      };
    }
  }, [selectedConversation]); // Dependency array

  // ... (Keep your other functions: scrollToBottom, sendMessage, getInitials, formatTime)
  // (No changes needed for them right now)

  const getInitials = (name) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  
  const sendMessage = () => {
    if (!newMessage.trim() || !webSocketRef.current) return;
    
    const messagePayload = {
      content: newMessage,
      sender_lawyer_id: YOUR_LAWYER_ID,
      sender_client_id: null
    };

    webSocketRef.current.send(JSON.stringify(messagePayload));
    setNewMessage("");
  };


  // --- RENDER LOGIC ---
  return (
    <MainLayout>
      <div className="flex gap-6 h-[80vh]">
        {/* Left: Conversations */}
        <Card className="w-1/3 flex flex-col">
          <CardHeader>
            <CardTitle>Messages</CardTitle>
            <Input placeholder="Search..." className="mt-2" />
          </CardHeader>
          
          {/* UPDATED CardContent to show Loading/Error states */}
          <CardContent className="p-0 flex-1">
            <ScrollArea className="h-full">
              {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading...</p>}
              
              {error && <p className="p-4 text-sm text-destructive">{error}</p>}
              
              {!isLoading && !error && (
                <div className="space-y-1">
                  {conversations.length === 0 && (
                    <p className="p-4 text-sm text-muted-foreground">No conversations found.</p>
                  )}
                  {conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => setSelectedConversation(conv)}
                      className={`w-full p-4 flex items-start gap-3 hover:bg-accent transition-colors ${
                        selectedConversation?.id === conv.id ? "bg-accent" : ""
                      }`}
                    >
                      <Avatar>
                        <AvatarFallback className="bg-primary/10 text-primary">{getInitials(conv.participantName)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 text-left overflow-hidden">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-semibold text-sm truncate">{conv.participantName}</h3>
                          {/* <span className="text-xs text-muted-foreground">{formatTime(conv.lastMessageTime)}</span> */}
                        </div>
                        <div className="flex items-center justify-between">
                          {/* <p className="text-sm text-muted-foreground truncate">{conv.lastMessage}</p> */}
                          {conv.unreadCount > 0 && (
                            <Badge variant="destructive" className="ml-2 h-5 w-5 flex items-center justify-center text-xs">
                              {conv.unreadCount}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right: Chat */}
        <Card className="flex-1 flex flex-col">
          {selectedConversation ? (
            <>
              <CardHeader className="border-b border-border flex items-center gap-3">
                <Avatar>
                  <AvatarFallback className="bg-primary/10 text-primary">{getInitials(selectedConversation.participantName)}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold">{selectedConversation.participantName}</h3>
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-4 overflow-hidden">
                <ScrollArea className="h-full pr-4">
                  <div className="space-y-3">
                    {messages.map((msg) => {
                      const isOwn = msg.sender_lawyer_id === YOUR_LAWYER_ID;
                      const senderName = isOwn ? "You" : selectedConversation.participantName;

                      return (
                        <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                          <div className={`flex gap-2 max-w-[70%] ${isOwn ? "flex-row-reverse" : ""}`}>
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className={isOwn ? "bg-primary text-primary-foreground" : "bg-muted"}>{getInitials(senderName)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className={`rounded-lg p-3 ${isOwn ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                                {msg.content}
                              </div>
                              <p className={`text-xs text-muted-foreground mt-1 ${isOwn ? "text-right" : ""}`}>
                                {formatTime(msg.timestamp)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
              </CardContent>
              <div className="border-t border-border p-4">
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon">
                    <Paperclip className="h-5 w-5" />
                  </Button>
                  <Input
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                    className="flex-1"
                  />
                  <Button onClick={sendMessage} size="icon" disabled={!newMessage.trim()}>
                    <Send className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <p>{isLoading ? "Loading..." : "Select a conversation to start messaging"}</p>
            </div>
          )}
        </Card>
      </div>
    </MainLayout>
  );
}