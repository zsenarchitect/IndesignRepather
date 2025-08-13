# InDesign Repather

A web-based tool for managing and repathing links in Adobe InDesign documents. This application provides a user-friendly interface to connect to InDesign, open documents, and efficiently repath linked assets.

## 🌐 Live Application

**Access the web application here:** [InDesign Repather Web App](https://your-username.github.io/IndesignRepather/)

## ✨ Features

- **Web-based Interface**: Modern, responsive web UI for easy access
- **InDesign Integration**: Direct connection to Adobe InDesign via COM
- **Link Management**: View and manage all linked assets in InDesign documents
- **Batch Repathing**: Efficiently repath multiple links at once
- **Version Detection**: Automatically detect available InDesign versions
- **Real-time Logging**: Monitor operations with detailed logging

## 🚀 Quick Start

1. **Open the Web App**: Click the link above to access the application
2. **Connect to InDesign**: The app will automatically detect available InDesign versions
3. **Open Document**: Select your InDesign (.indd) file
4. **Manage Links**: View and repath links as needed

## 📋 Prerequisites

- **Adobe InDesign**: Any recent version installed on your system
- **Windows OS**: This application uses Windows COM integration
- **Python Dependencies**: All required packages are pre-installed in the hosted environment

## 🛠️ Technical Details

### Backend Components
- `backend.py`: Core InDesign operations and link repathing logic
- `generate_web_app.py`: HTTP server and API endpoints
- `get_indesign_version.py`: InDesign version detection

### Frontend
- `index.html`: Modern web interface with dark theme
- Responsive design for desktop and mobile use

### Local Development
If you want to run this locally:

```bash
# Clone the repository
git clone https://github.com/your-username/IndesignRepather.git
cd IndesignRepather

# Install dependencies
pip install pywin32

# Run the web application
python generate_web_app.py
```

## 📁 Project Structure

```
IndesignRepather/
├── backend.py              # Core InDesign operations
├── generate_web_app.py     # Web server and API
├── get_indesign_version.py # Version detection
├── index.html             # Web interface
├── ClickMeToStart.bat     # Windows launcher
└── README.md              # This file
```

## 🔧 API Endpoints

- `GET /api/status` - Check application status
- `POST /api/get_indesign_versions` - Get available InDesign versions
- `POST /api/connect` - Connect to InDesign
- `POST /api/open_document` - Open InDesign document
- `POST /api/get_links` - Get document links
- `POST /api/repath_links` - Repath selected links
- `POST /api/document_info` - Get document information

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🆘 Support

If you encounter any issues:
1. Check the application logs
2. Ensure InDesign is properly installed
3. Verify you have administrator privileges if needed
4. Open an issue on GitHub

---

**Note**: This application requires Adobe InDesign to be installed on the system where it's running. The web interface provides remote access to local InDesign operations.