import socket, sys

HOST = '192.168.1.168'
PORT = 50000

# 1) Création du socket :
mySocket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

# 2) Tentative de connexion au serveur :
try:
    mySocket.connect((HOST, PORT))
except socket.error:
    print("La connexion a échoué.")
    sys.exit()

print("Connexion établie avec le serveur.")

# 3) Boucle d'échange avec le serveur :
#    On reçoit un message, on l'affiche, on répond, et on recommence
#    tant que le serveur n'envoie pas "FIN" (ou ne ferme pas la connexion).
msgServeur = mySocket.recv(1024).decode("Utf8")

while msgServeur.upper() != "FIN" and msgServeur != "":
    print("S>", msgServeur)
    msgClient = input("C> ")
    mySocket.send(msgClient.encode("Utf8"))
    msgServeur = mySocket.recv(1024).decode("Utf8")

# 4) Fermeture de la connexion :
print("Connexion interrompue.")
mySocket.close()
