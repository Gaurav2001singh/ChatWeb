const contactModel = require("../models/contactsModal");

exports.addContact = async (req, res) => {

    try {

        const userId = req.user.id;

        const { phoneNumber, contactName } = req.body;

        if (!phoneNumber || !contactName) {

            return res.status(400).json({
                message: "Phone number and name required"
            });
        }

        const result = await contactModel.addContact(
            userId,
            phoneNumber,
            contactName
        );

        if (!result.success) {
            return res.status(400).json({
                message: result.message
            });
        }

        res.status(201).json({
            message: "Contact added",
            contact: result.contact
        });

    } catch (error) {

        res.status(500).json({
            message: "Error adding contact",
            error: error.message
        });
    }
};

exports.getContacts = async (req, res) => {

    try {

        const userId = req.user.id;

        const contacts = await contactModel.getContacts(userId);

        res.status(200).json(contacts);

    } catch (error) {

        res.status(500).json({
            message: "Error fetching contacts",
            error: error.message
        });
    }
};

exports.updateContactName = async (req,res) => {

    try {

        const userId = req.user.id;

        const { contactUserId,contactName } = req.body;

        await contactModel.updateContactName(userId,contactUserId,contactName);

        res.json({
            message:"Updated"
        });

    } catch(error){

        res.status(500).json({
            message:error.message
        });
    }
};