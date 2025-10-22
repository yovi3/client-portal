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

// Mock data
const mockConversations = [
  {
    id: "1",
    participantName: "John Smith",
    lastMessage: "Please update me on the property case.",
    lastMessageTime: "2025-10-17T10:30:00",
    unreadCount: 2,
    messages: [
      { id: 1, senderName: "John Smith", senderRole: "client", content: "Hey, how’s the property case?", timestamp: "2025-10-17T09:00:00" },
      { id: 2, senderName: "You", senderRole: "lawyer", content: "I’m preparing the documents, will send soon.", timestamp: "2025-10-17T09:15:00" },
      { id: 3, senderName: "John Smith", senderRole: "client", content: "Great, thanks!", timestamp: "2025-10-17T09:20:00" },
    ],
  },
  {
    id: "2",
    participantName: "TechCorp Inc.",
    lastMessage: "We need the contract by tomorrow.",
    lastMessageTime: "2025-10-16T14:45:00",
    unreadCount: 0,
    messages: [
      { id: 1, senderName: "TechCorp Inc.", senderRole: "client", content: "Do you have the signed NDA?", timestamp: "2025-10-16T12:00:00" },
      { id: 2, senderName: "You", senderRole: "lawyer", content: "Yes, just sent it via email.", timestamp: "2025-10-16T12:15:00" },
      { id: 3, senderName: "TechCorp Inc.", senderRole: "client", content: "Received, thanks!", timestamp: "2025-10-16T12:20:00" },
    ],
  },
];

export default function Messages() {
  const [conversations, setConversations] = useState(mockConversations);
  const [selectedConversation, setSelectedConversation] = useState(mockConversations[0]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    scrollToBottom();
  }, [selectedConversation]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const sendMessage = () => {
    if (!newMessage.trim()) return;
    const updatedConversation = { ...selectedConversation };
    updatedConversation.messages.push({
      id: Date.now(),
      senderName: "You",
      senderRole: "lawyer",
      content: newMessage,
      timestamp: new Date().toISOString(),
    });
    setSelectedConversation(updatedConversation);
    setConversations((prev) =>
      prev.map((conv) => (conv.id === updatedConversation.id ? updatedConversation : conv))
    );
    setNewMessage("");
  };

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

  return (
    <MainLayout>
      <div className="flex gap-6 h-[80vh]">
        {/* Left: Conversations */}
        <Card className="w-1/3 flex flex-col">
          <CardHeader>
            <CardTitle>Messages</CardTitle>
            <Input placeholder="Search..." className="mt-2" />
          </CardHeader>
          <CardContent className="p-0 flex-1">
            <ScrollArea className="h-full">
              <div className="space-y-1">
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConversation(conv)}
                    className={`w-full p-4 flex items-start gap-3 hover:bg-accent transition-colors ${
                      selectedConversation.id === conv.id ? "bg-accent" : ""
                    }`}
                  >
                    <Avatar>
                      <AvatarFallback className="bg-primary/10 text-primary">{getInitials(conv.participantName)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left overflow-hidden">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold text-sm truncate">{conv.participantName}</h3>
                        <span className="text-xs text-muted-foreground">{formatTime(conv.lastMessageTime)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground truncate">{conv.lastMessage}</p>
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
                    {selectedConversation.messages.map((msg) => {
                      const isOwn = msg.senderRole === "lawyer";
                      return (
                        <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                          <div className={`flex gap-2 max-w-[70%] ${isOwn ? "flex-row-reverse" : ""}`}>
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className={isOwn ? "bg-primary text-primary-foreground" : "bg-muted"}>{getInitials(msg.senderName)}</AvatarFallback>
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
              <p>Select a conversation to start messaging</p>
            </div>
          )}
        </Card>
      </div>
    </MainLayout>
  );
}
